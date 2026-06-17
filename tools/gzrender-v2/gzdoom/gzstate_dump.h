#pragma once

struct FLevelLocals;

void GZState_SetDumpPath(const char *path);
void GZState_SetRefFramePath(const char *path);
bool GZState_HasPendingAutomation();
void GZState_MaybeDumpAndExit(FLevelLocals *Level);
void GZState_MaybeCaptureRefFrame();

void GZState_DumpLevel(FLevelLocals *Level, const char *path);
