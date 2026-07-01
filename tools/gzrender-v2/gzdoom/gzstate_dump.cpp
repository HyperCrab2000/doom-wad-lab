/*
** gzstate_dump.cpp
** GZRender-V2 post-load GZSTATE v1 exporter.
**
** Binary layout must stay in sync with doom-wad-lab/gzstate/
*/

#include "gzstate_dump.h"

#include "c_dispatch.h"
#include "doomdata.h"
#include "doomstat.h"
#include "engineerrors.h"
#include "filesystem.h"
#include "gamestate.h"
#include "g_levellocals.h"
#include "m_misc.h"
#include "m_swap.h"
#include "p_setup.h"
#include "printf.h"
#include "r_defs.h"
#include "version.h"
#include "files.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <algorithm>
#include <map>
#include <tuple>
#include <vector>

static FString GZStatePendingDumpPath;
static FString GZStatePendingRefFramePath;
static bool GZStateRefFrameCaptured = false;
static int GZStateRefFrameWarmupFrames = 0;

static constexpr uint32_t GZSTATE_MAGIC = 0x54535A47; // 'GZST'
static constexpr uint32_t GZSTATE_VERSION = 1;
static constexpr uint32_t GZSTATE_HEADER_SIZE = 64;
static constexpr uint32_t GZSTATE_MAP_NAME_BYTES = 32;
static constexpr uint32_t GZSTATE_ENGINE_TAG_BYTES = 8;
static constexpr uint32_t GZSTATE_SECTION_ENTRY_SIZE = 16;
static constexpr uint32_t GZSTATE_NO_SIDE = 0xFFFF;
static constexpr uint32_t GZSTATE_NODE_SUBSECTOR_FLAG = 0x80000000;

enum GZStateSectionId : uint32_t
{
	SEC_STRING_TABLE = 1,
	SEC_VERTICES = 2,
	SEC_SECTORS = 3,
	SEC_SIDEDEFS = 4,
	SEC_LINEDEFS = 5,
	SEC_SEGS = 6,
	SEC_SUBSECTORS = 7,
	SEC_NODES = 8,
	SEC_THINGS = 9,
	SEC_MAP_META = 10,
	SEC_LUMP_CATALOG = 11,
	SEC_TEXTURE_DEFS = 12,
	SEC_FLAT_NAMES = 13,
	SEC_SPRITE_NAMES = 14,
	SEC_MUSIC_NAMES = 15,
	SEC_SOUND_NAMES = 16,
	SEC_PNAMES = 17,
	SEC_PATCH_RASTERS = 18,
	SEC_FLAT_RASTERS = 19,
	SEC_SPRITE_RASTERS = 20,
	SEC_TEXTURE_RASTERS = 21,
};

struct GZStateSection
{
	uint32_t id;
	std::vector<uint8_t> data;
};

static uint32_t Crc32(const uint8_t *data, size_t size)
{
	static uint32_t table[256];
	static bool init = false;
	if (!init)
	{
		for (uint32_t i = 0; i < 256; i++)
		{
			uint32_t c = i;
			for (int j = 0; j < 8; j++)
				c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
			table[i] = c;
		}
		init = true;
	}
	uint32_t crc = 0xFFFFFFFFu;
	for (size_t i = 0; i < size; i++)
		crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
	return crc ^ 0xFFFFFFFFu;
}

static void AppendU8(std::vector<uint8_t> &buf, uint8_t v) { buf.push_back(v); }

static void AppendU16(std::vector<uint8_t> &buf, uint16_t v)
{
	buf.push_back(v & 0xFF);
	buf.push_back(v >> 8);
}

static void AppendU32(std::vector<uint8_t> &buf, uint32_t v)
{
	buf.push_back(v & 0xFF);
	buf.push_back((v >> 8) & 0xFF);
	buf.push_back((v >> 16) & 0xFF);
	buf.push_back(v >> 24);
}

static void AppendI16(std::vector<uint8_t> &buf, int16_t v) { AppendU16(buf, (uint16_t)v); }
static void AppendI32(std::vector<uint8_t> &buf, int32_t v) { AppendU32(buf, (uint32_t)v); }

static int32_t ToMapUnits(double v)
{
	return (int32_t)(v >= 0 ? v + 0.5 : v - 0.5);
}

static uint32_t RawNodeChild(uint16_t child)
{
	uint16_t c = LittleShort(child);
	if (c & mapnode_t::NF_SUBSECTOR)
		return (uint32_t)(c & ~mapnode_t::NF_SUBSECTOR) | GZSTATE_NODE_SUBSECTOR_FLAG;
	return c;
}

static uint32_t InternString(std::vector<FString> &strings, const char *value)
{
	FString key = value != nullptr ? value : "";
	key.ToUpper();
	for (size_t i = 0; i < strings.size(); i++)
	{
		if (strings[i].Compare(key) == 0) return (uint32_t)i;
	}
	strings.push_back(key);
	return (uint32_t)(strings.size() - 1);
}

static FString TrimLumpName(const char *name8)
{
	char buf[9] = { 0 };
	memcpy(buf, name8, 8);
	FString s = buf;
	s.StripRight();
	s.ToUpper();
	return s;
}

static bool IsExactLumpName(const FString &upper, const char *literal)
{
	return upper.Compare(literal) == 0;
}

static bool IsMarkerLump(const FString &upper)
{
	static const char *markers[] = {
		"F_START", "F_END", "FF_START", "FF_END",
		"S_START", "S_END", "SS_START", "SS_END",
		"P_START", "P_END", "P1_START", "P1_END", "P2_START", "P2_END", "P3_START", "P3_END",
		nullptr
	};
	for (int i = 0; markers[i]; ++i)
		if (IsExactLumpName(upper, markers[i])) return true;
	return false;
}

static bool IsMapLumpName(const FString &upper)
{
	if (upper.Len() >= 4 && upper[0] == 'E' && upper[2] == 'M')
	{
		if (upper[1] >= '1' && upper[1] <= '4' && upper[3] >= '0' && upper[3] <= '9')
			return true;
	}
	if (upper.IndexOf("MAP") == 0 && upper.Len() == 5)
	{
		for (int i = 3; i < 5; i++)
			if (upper[i] < '0' || upper[i] > '9') return false;
		return true;
	}
	return false;
}

static bool IsStoryTextLump(const FString &upper)
{
	if (upper.IndexOf("TEXT") == 0 && upper.Len() == 5 && upper[4] >= '0' && upper[4] <= '9') return true;
	if (upper.IndexOf("HELP") == 0 && upper.Len() == 5 && upper[4] >= '0' && upper[4] <= '9') return true;
	if (IsExactLumpName(upper, "CREDIT")) return true;
	if (upper.IndexOf("P_") == 0)
	{
		static const char *names[] = { "P_TITL", "P_INTER", "P_NET", "P_END", "P_RWDM", "P_CWDM", "P_BONUS", "P_GOTHIC", nullptr };
		for (int i = 0; names[i]; ++i)
			if (IsExactLumpName(upper, names[i])) return true;
	}
	return false;
}

static bool IsMenuTextLump(const FString &upper)
{
	static const char *exact[] = { "HELP", "DMENUPIC", "TITLE", "END", "LOAD", "SAVE", "ENDOOM", nullptr };
	for (int i = 0; exact[i]; ++i)
		if (IsExactLumpName(upper, exact[i])) return true;
	if (upper.IndexOf("M_") != 0 || upper.Len() < 4) return false;
	static const char *suffixes[] = { "RDLG", "SDLG", "SKLG", "FSLG", "ENDLG", nullptr };
	for (int i = 0; suffixes[i]; ++i)
	{
		const char *suffix = suffixes[i];
		int slen = (int)strlen(suffix);
		if (upper.Len() >= 2 + slen && !strncmp(upper.GetChars() + 2, suffix, slen))
		{
			if (upper.Len() == 2 + slen || upper.Len() == 2 + slen + 1) return true;
		}
	}
	return false;
}

static bool IsIntermissionLump(const FString &upper)
{
	static const char *names[] = { "P1_END", "P1_INTER", "P1_RWDM", "P1_CWDM", "P1_BONUS", nullptr };
	for (int i = 0; names[i]; ++i)
		if (IsExactLumpName(upper, names[i])) return true;
	return false;
}

static uint8_t CategorizeLumpName(const char *name)
{
	FString upper = name;
	upper.ToUpper();
	if (IsMarkerLump(upper)) return 14;
	if (IsMapLumpName(upper)) return 0;
	if (IsExactLumpName(upper, "PLAYPAL")) return 7;
	if (IsExactLumpName(upper, "COLORMAP")) return 8;
	if (IsExactLumpName(upper, "GENMIDI") || IsExactLumpName(upper, "DMXGUS")) return 13;
	if (IsExactLumpName(upper, "PNAMES") || upper.IndexOf("TEXTURE") == 0) return 6;
	if (upper.IndexOf("DEMO") == 0 && upper.Len() == 5) return 12;
	if (IsExactLumpName(upper, "DMUSINFO")) return 1;
	if (IsStoryTextLump(upper)) return 9;
	if (IsMenuTextLump(upper)) return 10;
	if (IsIntermissionLump(upper)) return 11;
	if (upper.IndexOf("D_") == 0) return 1;
	if (upper.IndexOf("DS") == 0 || upper.IndexOf("DP") == 0) return 2;
	return 15;
}

static int IwadLumpStart()
{
	return fileSystem.GetFirstEntry(fileSystem.GetIwadNum());
}

static int IwadLumpEnd()
{
	return fileSystem.GetLastEntry(fileSystem.GetIwadNum());
}

static bool IsIwadLumpIndex(int lump)
{
	int iwad = fileSystem.GetIwadNum();
	return lump >= IwadLumpStart() && lump <= IwadLumpEnd() && fileSystem.GetFileContainer(lump) == iwad;
}

static void WriteStringTable(GZStateSection &section, const std::vector<FString> &strings)
{
	section.id = SEC_STRING_TABLE;
	AppendU32(section.data, (uint32_t)strings.size());
	for (size_t i = 0; i < strings.size(); i++)
	{
		const char *chars = strings[i].GetChars();
		uint32_t len = (uint32_t)strlen(chars);
		AppendU32(section.data, len);
		for (uint32_t j = 0; j < len; j++) AppendU8(section.data, (uint8_t)chars[j]);
	}
}

static void WriteStringIndexList(GZStateSection &section, uint32_t sectionId, const std::vector<uint32_t> &indices)
{
	section.id = sectionId;
	AppendU32(section.data, (uint32_t)indices.size());
	for (uint32_t index : indices) AppendU32(section.data, index);
}

static void WriteRawVertices(GZStateSection &section, MapData *map)
{
	section.id = SEC_VERTICES;
	auto data = map->Read(ML_VERTEXES);
	int count = (int)(data.Size() / sizeof(mapvertex_t));
	AppendU32(section.data, (uint32_t)count);
	auto *vtx = (mapvertex_t *)data.Data();
	for (int i = 0; i < count; i++)
	{
		AppendI32(section.data, LittleShort(vtx[i].x));
		AppendI32(section.data, LittleShort(vtx[i].y));
	}
}

static void WriteRawSectors(GZStateSection &section, MapData *map, std::vector<FString> &strings)
{
	section.id = SEC_SECTORS;
	auto data = map->Read(ML_SECTORS);
	int count = (int)(data.Size() / sizeof(mapsector_t));
	AppendU32(section.data, (uint32_t)count);
	auto *sec = (mapsector_t *)data.Data();
	for (int i = 0; i < count; i++)
	{
		AppendI32(section.data, LittleShort(sec[i].floorheight));
		AppendI32(section.data, LittleShort(sec[i].ceilingheight));
		AppendI16(section.data, LittleShort(sec[i].lightlevel));
		AppendU16(section.data, (uint16_t)LittleShort(sec[i].special));
		AppendI16(section.data, LittleShort(sec[i].tag));
		AppendU32(section.data, InternString(strings, TrimLumpName(sec[i].floorpic).GetChars()));
		AppendU32(section.data, InternString(strings, TrimLumpName(sec[i].ceilingpic).GetChars()));
		AppendU32(section.data, 0);
	}
}

static void WriteRawSidedefs(GZStateSection &section, MapData *map, std::vector<FString> &strings)
{
	section.id = SEC_SIDEDEFS;
	auto data = map->Read(ML_SIDEDEFS);
	int count = (int)(data.Size() / sizeof(mapsidedef_t));
	AppendU32(section.data, (uint32_t)count);
	auto *side = (mapsidedef_t *)data.Data();
	for (int i = 0; i < count; i++)
	{
		AppendI32(section.data, LittleShort(side[i].textureoffset));
		AppendI32(section.data, LittleShort(side[i].rowoffset));
		AppendU32(section.data, InternString(strings, TrimLumpName(side[i].toptexture).GetChars()));
		AppendU32(section.data, InternString(strings, TrimLumpName(side[i].bottomtexture).GetChars()));
		AppendU32(section.data, InternString(strings, TrimLumpName(side[i].midtexture).GetChars()));
		AppendU32(section.data, (uint32_t)LittleShort(side[i].sector));
	}
}

static void WriteRawLinedefs(GZStateSection &section, MapData *map)
{
	section.id = SEC_LINEDEFS;
	auto data = map->Read(ML_LINEDEFS);
	int count = map->HasBehavior
		? (int)(data.Size() / sizeof(maplinedef2_t))
		: (int)(data.Size() / sizeof(maplinedef_t));
	AppendU32(section.data, (uint32_t)count);
	if (map->HasBehavior)
	{
		auto *line = (maplinedef2_t *)data.Data();
		for (int i = 0; i < count; i++)
		{
			AppendU32(section.data, LittleShort(line[i].v1));
			AppendU32(section.data, LittleShort(line[i].v2));
			AppendU32(section.data, LittleShort(line[i].flags));
			AppendU32(section.data, 0);
			AppendU16(section.data, line[i].special);
			int s0 = LittleShort(line[i].sidenum[0]);
			int s1 = LittleShort(line[i].sidenum[1]);
			AppendU16(section.data, s0 >= 0 ? (uint16_t)s0 : GZSTATE_NO_SIDE);
			AppendU16(section.data, s1 >= 0 ? (uint16_t)s1 : GZSTATE_NO_SIDE);
			AppendI16(section.data, (int16_t)line[i].args[0]);
			AppendU32(section.data, 0);
			for (int a = 0; a < 5; a++) AppendI32(section.data, line[i].args[a]);
		}
	}
	else
	{
		auto *line = (maplinedef_t *)data.Data();
		for (int i = 0; i < count; i++)
		{
			AppendU32(section.data, LittleShort(line[i].v1));
			AppendU32(section.data, LittleShort(line[i].v2));
			AppendU32(section.data, LittleShort(line[i].flags));
			AppendU32(section.data, 0);
			AppendU16(section.data, LittleShort(line[i].special));
			int s0 = LittleShort(line[i].sidenum[0]);
			int s1 = LittleShort(line[i].sidenum[1]);
			AppendU16(section.data, s0 >= 0 ? (uint16_t)s0 : GZSTATE_NO_SIDE);
			AppendU16(section.data, s1 >= 0 ? (uint16_t)s1 : GZSTATE_NO_SIDE);
			AppendI16(section.data, LittleShort(line[i].tag));
			AppendU32(section.data, 0);
			int tag = LittleShort(line[i].tag);
			AppendI32(section.data, tag);
			for (int a = 1; a < 5; a++) AppendI32(section.data, 0);
		}
	}
}

static void WriteRawSegs(GZStateSection &section, MapData *map)
{
	section.id = SEC_SEGS;
	auto data = map->Read(ML_SEGS);
	int count = (int)(data.Size() / sizeof(mapseg_t));
	AppendU32(section.data, (uint32_t)count);
	auto *seg = (mapseg_t *)data.Data();
	for (int i = 0; i < count; i++)
	{
		AppendU32(section.data, seg[i].V1());
		AppendU32(section.data, seg[i].V2());
		AppendI16(section.data, LittleShort(seg[i].angle));
		uint16_t ld = LittleShort(seg[i].linedef);
		AppendU16(section.data, ld == 0xFFFF ? GZSTATE_NO_SIDE : ld);
		AppendI16(section.data, LittleShort(seg[i].side));
		AppendI16(section.data, LittleShort(seg[i].offset));
	}
}

static void WriteRawSubsectors(GZStateSection &section, MapData *map)
{
	section.id = SEC_SUBSECTORS;
	auto data = map->Read(ML_SSECTORS);
	int count = (int)(data.Size() / sizeof(mapsubsector_t));
	AppendU32(section.data, (uint32_t)count);
	auto *sub = (mapsubsector_t *)data.Data();
	for (int i = 0; i < count; i++)
	{
		AppendU32(section.data, LittleShort(sub[i].numsegs));
		AppendU32(section.data, LittleShort(sub[i].firstseg));
		AppendU32(section.data, 0);
		AppendU16(section.data, 0);
		AppendU16(section.data, 0);
	}
}

static void WriteRawNodes(GZStateSection &section, MapData *map)
{
	section.id = SEC_NODES;
	auto data = map->Read(ML_NODES);
	int count = (int)(data.Size() / sizeof(mapnode_t));
	AppendU32(section.data, (uint32_t)count);
	auto *node = (mapnode_t *)data.Data();
	for (int i = 0; i < count; i++)
	{
		AppendI16(section.data, LittleShort(node[i].x));
		AppendI16(section.data, LittleShort(node[i].y));
		AppendI16(section.data, LittleShort(node[i].dx));
		AppendI16(section.data, LittleShort(node[i].dy));
		AppendU32(section.data, RawNodeChild(node[i].children[0]));
		AppendU32(section.data, RawNodeChild(node[i].children[1]));
		for (int b = 0; b < 8; b++)
			AppendI16(section.data, LittleShort(node[i].bbox[b / 4][b % 4]));
	}
}

static void WriteRawThings(GZStateSection &section, MapData *map)
{
	section.id = SEC_THINGS;
	auto data = map->Read(ML_THINGS);
	if (map->HasBehavior)
	{
		int count = (int)(data.Size() / sizeof(mapthinghexen_t));
		AppendU32(section.data, (uint32_t)count);
		auto *mt = (mapthinghexen_t *)data.Data();
		for (int i = 0; i < count; i++)
		{
			AppendI32(section.data, LittleShort(mt[i].x));
			AppendI32(section.data, LittleShort(mt[i].y));
			AppendI32(section.data, LittleShort(mt[i].z));
			AppendU16(section.data, (uint16_t)LittleShort(mt[i].angle));
			AppendU16(section.data, (uint16_t)LittleShort(mt[i].type));
			AppendU32(section.data, (uint32_t)LittleShort(mt[i].flags));
			AppendU16(section.data, (uint16_t)LittleShort(mt[i].thingid));
			AppendU16(section.data, 0);
		}
	}
	else
	{
		int count = (int)(data.Size() / sizeof(mapthing_t));
		AppendU32(section.data, (uint32_t)count);
		auto *mt = (mapthing_t *)data.Data();
		for (int i = 0; i < count; i++)
		{
			AppendI32(section.data, LittleShort(mt[i].x));
			AppendI32(section.data, LittleShort(mt[i].y));
			AppendI32(section.data, 0);
			AppendU16(section.data, (uint16_t)LittleShort(mt[i].angle));
			AppendU16(section.data, (uint16_t)LittleShort(mt[i].type));
			AppendU32(section.data, (uint32_t)(uint16_t)LittleShort(mt[i].options));
			AppendU16(section.data, 0);
			AppendU16(section.data, 0);
		}
	}
}

static void WriteLumpCatalog(GZStateSection &section, std::vector<FString> &strings)
{
	section.id = SEC_LUMP_CATALOG;
	std::map<FString, std::pair<uint32_t, uint32_t>> uniqueLumps;
	for (int i = IwadLumpStart(); i <= IwadLumpEnd(); i++)
	{
		if (!IsIwadLumpIndex(i)) continue;
		FString name = fileSystem.GetFileShortName(i);
		name.ToUpper();
		if (uniqueLumps.find(name) != uniqueLumps.end()) continue;
		auto bytes = fileSystem.ReadFile(i);
		uniqueLumps[name] = std::make_pair((uint32_t)bytes.size(), Crc32(bytes.bytes(), bytes.size()));
	}
	AppendU32(section.data, (uint32_t)uniqueLumps.size());
	for (auto &entry : uniqueLumps)
	{
		AppendU32(section.data, InternString(strings, entry.first.GetChars()));
		AppendU32(section.data, entry.second.first);
		AppendU32(section.data, entry.second.second);
		AppendU8(section.data, CategorizeLumpName(entry.first.GetChars()));
		AppendU8(section.data, 0);
		AppendU8(section.data, 0);
		AppendU8(section.data, 0);
	}
}

static void WriteTextureDefs(GZStateSection &section, std::vector<FString> &strings)
{
	section.id = SEC_TEXTURE_DEFS;
	struct TextureDefData
	{
		FString name;
		uint16_t width;
		uint16_t height;
		std::vector<std::tuple<int16_t, int16_t, uint16_t>> patches;
	};
	std::map<FString, TextureDefData> texMap;

	auto collectTextureLump = [&](const char *lumpName) {
		int lump = fileSystem.CheckNumForName(lumpName);
		if (lump < 0) return;
		if (fileSystem.GetFileContainer(lump) != fileSystem.GetIwadNum()) return;
		auto texData = fileSystem.ReadFile(lump);
		if (texData.size() < 4) return;
		const uint8_t *base = texData.bytes();
		int numTextures = LittleLong(*(const int32_t *)base);
		if (numTextures < 0 || (size_t)(4 + numTextures * 4) > texData.size()) return;
		for (int i = 0; i < numTextures; i++)
		{
			int32_t offset = LittleLong(*(const int32_t *)(base + 4 + i * 4));
			if (offset < 0 || (size_t)offset + 22 > texData.size()) continue;
			const uint8_t *tex = base + offset;
			char name[9] = { 0 };
			memcpy(name, tex, 8);
			FString upper = name;
			upper.StripRight();
			upper.ToUpper();
			uint16_t width = LittleShort(*(const int16_t *)(tex + 12));
			uint16_t height = LittleShort(*(const int16_t *)(tex + 14));
			int16_t patchCount = LittleShort(*(const int16_t *)(tex + 20));
			if (patchCount < 0 || (size_t)offset + 22 + (size_t)patchCount * 10 > texData.size()) continue;
			TextureDefData def;
			def.name = upper;
			def.width = width;
			def.height = height;
			const uint8_t *patch = tex + 22;
			for (int p = 0; p < patchCount; p++)
			{
				def.patches.emplace_back(
					LittleShort(*(const int16_t *)(patch + 0)),
					LittleShort(*(const int16_t *)(patch + 2)),
					(uint16_t)LittleShort(*(const int16_t *)(patch + 4)));
				patch += 10;
			}
			texMap[upper] = std::move(def);
		}
	};
	collectTextureLump("TEXTURE1");
	collectTextureLump("TEXTURE2");

	AppendU32(section.data, (uint32_t)texMap.size());
	for (auto &entry : texMap)
	{
		auto &def = entry.second;
		AppendU32(section.data, InternString(strings, def.name.GetChars()));
		AppendU16(section.data, def.width);
		AppendU16(section.data, def.height);
		AppendU16(section.data, (uint16_t)def.patches.size());
		AppendU16(section.data, 0);
		for (auto &patch : def.patches)
		{
			AppendI16(section.data, std::get<0>(patch));
			AppendI16(section.data, std::get<1>(patch));
			AppendU16(section.data, std::get<2>(patch));
			AppendU16(section.data, 0);
		}
	}
}

static void CollectMarkerRangeNames(const char startLetter, std::vector<uint32_t> &out, std::vector<FString> &strings)
{
	bool inRange = false;
	std::vector<FString> names;
	for (int i = IwadLumpStart(); i <= IwadLumpEnd(); i++)
	{
		if (!IsIwadLumpIndex(i)) continue;
		FString name = fileSystem.GetFileShortName(i);
		FString upper = name;
		upper.ToUpper();
		if (upper.Len() >= 5 && upper[0] == startLetter && upper.IndexOf("_START") >= 0)
		{
			inRange = true;
			continue;
		}
		if (upper.Len() >= 5 && upper[0] == startLetter && upper.IndexOf("_END") >= 0)
		{
			inRange = false;
			continue;
		}
		if (inRange)
		{
			name.ToUpper();
			names.push_back(name);
		}
	}
	std::sort(names.begin(), names.end(), [](const FString &a, const FString &b) { return a.Compare(b) < 0; });
	for (auto &name : names) out.push_back(InternString(strings, name.GetChars()));
}

static void CollectAssetNames(uint8_t category, std::vector<uint32_t> &out, std::vector<FString> &strings)
{
	std::map<FString, bool> unique;
	for (int i = IwadLumpStart(); i <= IwadLumpEnd(); i++)
	{
		if (!IsIwadLumpIndex(i)) continue;
		FString name = fileSystem.GetFileShortName(i);
		if (CategorizeLumpName(name.GetChars()) == category)
		{
			name.ToUpper();
			unique[name] = true;
		}
	}
	for (auto &entry : unique)
		out.push_back(InternString(strings, entry.first.GetChars()));
}

struct Playpal256
{
	uint8_t rgb[256][3];
};

static bool LoadPlaypal(Playpal256 &pal)
{
	int lump = fileSystem.CheckNumForName("PLAYPAL");
	if (lump < 0 || !IsIwadLumpIndex(lump)) return false;
	auto data = fileSystem.ReadFile(lump);
	if (data.size() < 768) return false;
	const uint8_t *base = data.bytes();
	for (int i = 0; i < 256; i++)
	{
		pal.rgb[i][0] = base[i * 3 + 0];
		pal.rgb[i][1] = base[i * 3 + 1];
		pal.rgb[i][2] = base[i * 3 + 2];
	}
	return true;
}

static bool RasterizePatch(const uint8_t *patch, size_t patchSize, const Playpal256 &pal, std::vector<uint8_t> &rgba, uint16_t &width, uint16_t &height)
{
	if (patchSize < 8) return false;
	width = LittleShort(*(const int16_t *)(patch + 0));
	height = LittleShort(*(const int16_t *)(patch + 2));
	if (width == 0 || height == 0 || patchSize < (size_t)8 + width * 4) return false;
	rgba.assign((size_t)width * height * 4, 0);
	for (int col = 0; col < width; col++)
	{
		uint32_t ofs = LittleLong(*(const uint32_t *)(patch + 8 + col * 4));
		if (ofs >= patchSize) continue;
		size_t pos = ofs;
		int yPos = 0;
		while (yPos < height && pos + 1 < patchSize)
		{
			uint8_t yOffset = patch[pos++];
			if (yOffset == 255) break;
			if (pos >= patchSize) break;
			uint8_t numPixels = patch[pos++];
			if (pos >= patchSize) break;
			pos++; // unused topdelta duplicate
			for (int j = 0; j < numPixels; j++)
			{
				if (pos >= patchSize) break;
				uint8_t index = patch[pos++];
				int dst = (col + (yOffset + j) * width) * 4;
				if (dst + 3 >= (int)rgba.size()) continue;
				rgba[dst + 0] = pal.rgb[index][0];
				rgba[dst + 1] = pal.rgb[index][1];
				rgba[dst + 2] = pal.rgb[index][2];
				rgba[dst + 3] = 255;
			}
			if (pos < patchSize) pos++; // unused
			yPos = yOffset + numPixels;
		}
	}
	return true;
}

static bool RasterizeFlat(const uint8_t *flat, size_t flatSize, const Playpal256 &pal, std::vector<uint8_t> &rgba)
{
	if (flatSize < 4096) return false;
	rgba.resize(4096 * 4);
	for (int i = 0; i < 4096; i++)
	{
		uint8_t index = flat[i];
		rgba[i * 4 + 0] = pal.rgb[index][0];
		rgba[i * 4 + 1] = pal.rgb[index][1];
		rgba[i * 4 + 2] = pal.rgb[index][2];
		rgba[i * 4 + 3] = 255;
	}
	return true;
}

static void BlitPatch(std::vector<uint8_t> &target, int targetW, int targetH, const std::vector<uint8_t> &patch, int patchW, int patchH, int originX, int originY)
{
	for (int y = 0; y < patchH; y++)
	{
		for (int x = 0; x < patchW; x++)
		{
			int dstX = originX + x;
			int dstY = originY + y;
			if (dstX < 0 || dstY < 0 || dstX >= targetW || dstY >= targetH) continue;
			int src = (y * patchW + x) * 4;
			if (patch[src + 3] == 0) continue;
			int dst = (dstY * targetW + dstX) * 4;
			target[dst + 0] = patch[src + 0];
			target[dst + 1] = patch[src + 1];
			target[dst + 2] = patch[src + 2];
			target[dst + 3] = patch[src + 3];
		}
	}
}

static uint32_t DigestRgba(const std::vector<uint8_t> &rgba)
{
	return Crc32(rgba.data(), rgba.size());
}

static void AppendRasterDigest(std::vector<uint8_t> &section, std::vector<FString> &strings, const char *name, uint32_t kind, uint16_t width, uint16_t height, uint32_t rgbaCrc)
{
	AppendU32(section, InternString(strings, name));
	AppendU32(section, kind);
	AppendU16(section, width);
	AppendU16(section, height);
	AppendU32(section, rgbaCrc);
}

static int FindIwadLumpByName(const char *name)
{
	for (int i = IwadLumpStart(); i <= IwadLumpEnd(); i++)
	{
		if (!IsIwadLumpIndex(i)) continue;
		if (fileSystem.CheckFileName(i, name)) return i;
	}
	return -1;
}

static void WritePatchRasterDigests(GZStateSection &section, std::vector<FString> &strings, const Playpal256 &pal)
{
	section.id = SEC_PATCH_RASTERS;
	struct PatchDigest { FString name; uint16_t w; uint16_t h; uint32_t crc; };
	std::vector<PatchDigest> digests;
	int pnames = FindIwadLumpByName("PNAMES");
	if (pnames >= 0)
	{
		auto data = fileSystem.ReadFile(pnames);
		if (data.size() >= 4)
		{
			int count = LittleLong(*(const int32_t *)data.bytes());
			const char *base = (const char *)data.bytes() + 4;
			for (int i = 0; i < count; i++)
			{
				char name[9] = { 0 };
				memcpy(name, base + i * 8, 8);
				FString patchName = name;
				patchName.StripRight();
				patchName.ToUpper();
				int lump = FindIwadLumpByName(patchName.GetChars());
				if (lump < 0) continue;
				auto patchData = fileSystem.ReadFile(lump);
				std::vector<uint8_t> rgba;
				uint16_t w = 0, h = 0;
				if (!RasterizePatch(patchData.bytes(), patchData.size(), pal, rgba, w, h)) continue;
				digests.push_back({ patchName, w, h, DigestRgba(rgba) });
			}
		}
	}
	std::sort(digests.begin(), digests.end(), [](const PatchDigest &a, const PatchDigest &b) { return a.name.Compare(b.name) < 0; });
	AppendU32(section.data, (uint32_t)digests.size());
	for (auto &entry : digests)
		AppendRasterDigest(section.data, strings, entry.name.GetChars(), 0, entry.w, entry.h, entry.crc);
}

static void WriteFlatRasterDigests(GZStateSection &section, std::vector<FString> &strings, const Playpal256 &pal)
{
	section.id = SEC_FLAT_RASTERS;
	std::vector<uint32_t> flatNames;
	CollectMarkerRangeNames('F', flatNames, strings);
	AppendU32(section.data, (uint32_t)flatNames.size());
	for (uint32_t nameIndex : flatNames)
	{
		FString name = strings[nameIndex];
		int lump = FindIwadLumpByName(name.GetChars());
		if (lump < 0) continue;
		auto flatData = fileSystem.ReadFile(lump);
		std::vector<uint8_t> rgba;
		RasterizeFlat(flatData.bytes(), flatData.size(), pal, rgba);
		AppendRasterDigest(section.data, strings, name.GetChars(), 1, 64, 64, DigestRgba(rgba));
	}
}

static void WriteSpriteRasterDigests(GZStateSection &section, std::vector<FString> &strings, const Playpal256 &pal)
{
	section.id = SEC_SPRITE_RASTERS;
	std::vector<uint32_t> spriteNames;
	CollectMarkerRangeNames('S', spriteNames, strings);
	AppendU32(section.data, (uint32_t)spriteNames.size());
	for (uint32_t nameIndex : spriteNames)
	{
		FString name = strings[nameIndex];
		int lump = FindIwadLumpByName(name.GetChars());
		if (lump < 0) continue;
		auto patchData = fileSystem.ReadFile(lump);
		std::vector<uint8_t> rgba;
		uint16_t w = 0, h = 0;
		if (!RasterizePatch(patchData.bytes(), patchData.size(), pal, rgba, w, h)) continue;
		AppendRasterDigest(section.data, strings, name.GetChars(), 2, w, h, DigestRgba(rgba));
	}
}

static void WriteTextureRasterDigests(GZStateSection &section, std::vector<FString> &strings, const Playpal256 &pal)
{
	section.id = SEC_TEXTURE_RASTERS;
	struct TexRaster { FString name; uint16_t w; uint16_t h; uint32_t crc; };
	std::vector<TexRaster> digests;

	auto collectTextureLump = [&](const char *lumpName) {
		int lump = fileSystem.CheckNumForName(lumpName);
		if (lump < 0 || !IsIwadLumpIndex(lump)) return;
		auto texData = fileSystem.ReadFile(lump);
		if (texData.size() < 4) return;
		const uint8_t *base = texData.bytes();
		int numTextures = LittleLong(*(const int32_t *)base);
		if (numTextures < 0 || (size_t)(4 + numTextures * 4) > texData.size()) return;
		for (int i = 0; i < numTextures; i++)
		{
			int32_t offset = LittleLong(*(const int32_t *)(base + 4 + i * 4));
			if (offset < 0 || (size_t)offset + 22 > texData.size()) continue;
			const uint8_t *tex = base + offset;
			char name[9] = { 0 };
			memcpy(name, tex, 8);
			FString upper = name;
			upper.StripRight();
			upper.ToUpper();
			uint16_t width = LittleShort(*(const int16_t *)(tex + 12));
			uint16_t height = LittleShort(*(const int16_t *)(tex + 14));
			int16_t patchCount = LittleShort(*(const int16_t *)(tex + 20));
			if (patchCount < 0 || (size_t)offset + 22 + (size_t)patchCount * 10 > texData.size()) continue;
			std::vector<uint8_t> rgba((size_t)width * height * 4, 0);
			const uint8_t *patch = tex + 22;
			for (int p = 0; p < patchCount; p++)
			{
				int16_t originX = LittleShort(*(const int16_t *)(patch + 0));
				int16_t originY = LittleShort(*(const int16_t *)(patch + 2));
				uint16_t patchIndex = (uint16_t)LittleShort(*(const int16_t *)(patch + 4));
				patch += 10;
				int pnames = FindIwadLumpByName("PNAMES");
				if (pnames < 0) continue;
				auto pnamesData = fileSystem.ReadFile(pnames);
				int pcount = LittleLong(*(const int32_t *)pnamesData.bytes());
				if ((int)patchIndex >= pcount) continue;
				const char *pbase = (const char *)pnamesData.bytes() + 4;
				char pname[9] = { 0 };
				memcpy(pname, pbase + patchIndex * 8, 8);
				FString patchName = pname;
				patchName.StripRight();
				patchName.ToUpper();
				int plump = FindIwadLumpByName(patchName.GetChars());
				if (plump < 0) continue;
				auto patchData = fileSystem.ReadFile(plump);
				std::vector<uint8_t> patchRgba;
				uint16_t pw = 0, ph = 0;
				if (!RasterizePatch(patchData.bytes(), patchData.size(), pal, patchRgba, pw, ph)) continue;
				BlitPatch(rgba, width, height, patchRgba, pw, ph, originX, originY);
			}
			int transparentPixels = 0;
			for (size_t pi = 3; pi < rgba.size(); pi += 4)
				if (rgba[pi] == 0) transparentPixels++;
			bool transparent = transparentPixels >= 2;
			if (!transparent && transparentPixels > 0)
			{
				std::fill(rgba.begin(), rgba.end(), 0);
				for (int alpha = 3; alpha < (int)rgba.size(); alpha += 4) rgba[alpha] = 255;
				patch = tex + 22;
				for (int p = 0; p < patchCount; p++)
				{
					int16_t originX = LittleShort(*(const int16_t *)(patch + 0));
					int16_t originY = LittleShort(*(const int16_t *)(patch + 2));
					uint16_t patchIndex = (uint16_t)LittleShort(*(const int16_t *)(patch + 4));
					patch += 10;
					int pnamesLump = FindIwadLumpByName("PNAMES");
					if (pnamesLump < 0) continue;
					auto pnamesData = fileSystem.ReadFile(pnamesLump);
					const char *pbase = (const char *)pnamesData.bytes() + 4;
					char pname[9] = { 0 };
					memcpy(pname, pbase + patchIndex * 8, 8);
					FString patchName = pname;
					patchName.StripRight();
					patchName.ToUpper();
					int plump = FindIwadLumpByName(patchName.GetChars());
					if (plump < 0) continue;
					auto patchData = fileSystem.ReadFile(plump);
					std::vector<uint8_t> patchRgba;
					uint16_t pw = 0, ph = 0;
					if (!RasterizePatch(patchData.bytes(), patchData.size(), pal, patchRgba, pw, ph)) continue;
					BlitPatch(rgba, width, height, patchRgba, pw, ph, originX, originY);
				}
			}
			digests.push_back({ upper, width, height, DigestRgba(rgba) });
		}
	};
	collectTextureLump("TEXTURE1");
	collectTextureLump("TEXTURE2");
	std::sort(digests.begin(), digests.end(), [](const TexRaster &a, const TexRaster &b) { return a.name.Compare(b.name) < 0; });
	AppendU32(section.data, (uint32_t)digests.size());
	for (auto &entry : digests)
		AppendRasterDigest(section.data, strings, entry.name.GetChars(), 3, entry.w, entry.h, entry.crc);
}

static void WritePnames(GZStateSection &section, std::vector<FString> &strings)
{
	std::vector<uint32_t> indices;
	int lump = fileSystem.CheckNumForName("PNAMES");
	if (lump >= 0)
	{
		auto data = fileSystem.ReadFile(lump);
		if (data.size() >= 4)
		{
			int count = LittleLong(*(const int32_t *)data.bytes());
			const char *base = (const char *)data.bytes() + 4;
			for (int i = 0; i < count; i++)
			{
				char name[9] = { 0 };
				memcpy(name, base + i * 8, 8);
				FString trimmed = name;
				trimmed.StripRight();
				trimmed.ToUpper();
				indices.push_back(InternString(strings, trimmed.GetChars()));
			}
		}
	}
	WriteStringIndexList(section, SEC_PNAMES, indices);
}

static bool WriteFile(const char *path, const std::vector<uint8_t> &bytes)
{
	FileWriter *fw = FileWriter::Open(path);
	if (fw == nullptr) return false;
	const bool ok = fw->Write(bytes.data(), bytes.size()) == bytes.size();
	delete fw;
	return ok;
}

void GZState_DumpLevel(FLevelLocals *Level, const char *path)
{
	MapData *map = P_OpenMapData(Level->MapName.GetChars(), true);
	if (map == nullptr)
	{
		Printf(TEXTCOLOR_RED "GZSTATE dump failed: could not open map '%s'\n", Level->MapName.GetChars());
		return;
	}

	std::vector<FString> strings;
	std::vector<GZStateSection> sections;

	WriteStringTable(sections.emplace_back(), strings);
	WriteRawVertices(sections.emplace_back(), map);
	WriteRawSectors(sections.emplace_back(), map, strings);
	WriteRawSidedefs(sections.emplace_back(), map, strings);
	WriteRawLinedefs(sections.emplace_back(), map);
	WriteRawSegs(sections.emplace_back(), map);
	WriteRawSubsectors(sections.emplace_back(), map);
	WriteRawNodes(sections.emplace_back(), map);
	WriteRawThings(sections.emplace_back(), map);
	WriteLumpCatalog(sections.emplace_back(), strings);
	WriteTextureDefs(sections.emplace_back(), strings);

	std::vector<uint32_t> flatNames, spriteNames, musicNames, soundNames;
	CollectMarkerRangeNames('F', flatNames, strings);
	CollectMarkerRangeNames('S', spriteNames, strings);
	CollectAssetNames(1, musicNames, strings);
	CollectAssetNames(2, soundNames, strings);
	WriteStringIndexList(sections.emplace_back(), SEC_FLAT_NAMES, flatNames);
	WriteStringIndexList(sections.emplace_back(), SEC_SPRITE_NAMES, spriteNames);
	WriteStringIndexList(sections.emplace_back(), SEC_MUSIC_NAMES, musicNames);
	WriteStringIndexList(sections.emplace_back(), SEC_SOUND_NAMES, soundNames);
	WritePnames(sections.emplace_back(), strings);

	Playpal256 playpal {};
	if (LoadPlaypal(playpal))
	{
		WritePatchRasterDigests(sections.emplace_back(), strings, playpal);
		WriteFlatRasterDigests(sections.emplace_back(), strings, playpal);
		WriteSpriteRasterDigests(sections.emplace_back(), strings, playpal);
		WriteTextureRasterDigests(sections.emplace_back(), strings, playpal);
	}

	delete map;

	sections[0] = GZStateSection{};
	WriteStringTable(sections[0], strings);

	std::vector<uint8_t> file;
	AppendU32(file, GZSTATE_MAGIC);
	AppendU32(file, GZSTATE_VERSION);
	AppendU32(file, 0);
	AppendU32(file, GZSTATE_HEADER_SIZE);
	AppendU32(file, (uint32_t)sections.size());
	AppendU32(file, GZSTATE_HEADER_SIZE);

	FString mapName = Level->MapName;
	mapName.Truncate(GZSTATE_MAP_NAME_BYTES - 1);
	for (int i = 0; i < (int)GZSTATE_MAP_NAME_BYTES; i++)
	{
		char c = i < mapName.Len() ? mapName[i] : 0;
		AppendU8(file, (uint8_t)c);
	}

	FString engineTag = GetGitHash();
	engineTag.Truncate(GZSTATE_ENGINE_TAG_BYTES - 1);
	for (int i = 0; i < (int)GZSTATE_ENGINE_TAG_BYTES; i++)
	{
		char c = i < engineTag.Len() ? engineTag[i] : 0;
		AppendU8(file, (uint8_t)c);
	}

	uint32_t dataOffset = GZSTATE_HEADER_SIZE + (uint32_t)sections.size() * GZSTATE_SECTION_ENTRY_SIZE;
	uint32_t cursor = dataOffset;
	for (auto &section : sections)
	{
		AppendU32(file, section.id);
		AppendU32(file, cursor);
		AppendU32(file, (uint32_t)section.data.size());
		AppendU32(file, Crc32(section.data.data(), section.data.size()));
		cursor += (uint32_t)section.data.size();
	}
	for (auto &section : sections)
		file.insert(file.end(), section.data.begin(), section.data.end());

	if (!WriteFile(path, file))
	{
		Printf(TEXTCOLOR_RED "GZSTATE dump failed: could not write '%s'\n", path);
		return;
	}

	Printf(TEXTCOLOR_GREEN "GZSTATE dumped %u bytes (raw WAD parity, map %s) -> %s\n",
		(unsigned)file.size(), Level->MapName.GetChars(), path);
}

void GZState_SetDumpPath(const char *path)
{
	GZStatePendingDumpPath = path;
}

void GZState_SetRefFramePath(const char *path)
{
	GZStatePendingRefFramePath = path;
	GZStateRefFrameCaptured = false;
	GZStateRefFrameWarmupFrames = 0;
}

bool GZState_HasPendingAutomation()
{
	return GZStatePendingDumpPath.IsNotEmpty() || GZStatePendingRefFramePath.IsNotEmpty();
}

void GZState_MaybeDumpAndExit(FLevelLocals *Level)
{
	if (GZStatePendingDumpPath.IsNotEmpty())
	{
		FString path = GZStatePendingDumpPath;
		GZStatePendingDumpPath = "";
		GZState_DumpLevel(Level, path.GetChars());
		if (GZStatePendingRefFramePath.IsEmpty())
			throw CExitEvent(0);
	}
}

void GZState_MaybeCaptureRefFrame()
{
	if (GZStateRefFrameCaptured || GZStatePendingRefFramePath.IsEmpty())
		return;
	if (gamestate != GS_LEVEL || gametic == 0 || !viewactive)
		return;

	GZStateRefFrameWarmupFrames++;
	if (GZStateRefFrameWarmupFrames < 2)
		return;

	FString path = GZStatePendingRefFramePath;
	GZStatePendingRefFramePath = "";
	GZStateRefFrameCaptured = true;
	M_ScreenShot(path.GetChars());
	Printf(TEXTCOLOR_GREEN "GZSTATE reference frame captured -> %s\n", path.GetChars());
	throw CExitEvent(0);
}

CCMD(dumpgzstate)
{
	if (argv.argc() < 2)
	{
		Printf("Usage: dumpgzstate <output-file>\n");
		return;
	}
	for (auto Level : AllLevels())
	{
		GZState_DumpLevel(Level, argv[1]);
	}
}
