#include "mididevice.h"
#include "zmusic/midiconfig.h"

FluidConfig fluidConfig;

MIDIDevice *CreateFluidSynthMIDIDevice(int samplerate, const char *Args)
{
	(void)samplerate;
	(void)Args;
	return nullptr;
}
