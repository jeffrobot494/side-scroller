---
type: design
category: development-tools
status: unbuilt
resolution: sharp
related: [asset-generation, level-generation]
---

# Player2 Lab

A standalone page for running every Player2 generation modality (text, speech, images, video, music, 3D) and putting the results side by side.

| | |
|---|---|
| Is | A developer test bench for Player2's models |
| Is not | Part of the game. No link to it from the game or the editor. It is opened by URL |
| Serves | Only Player2 models |
| Model choice | Made in Player2's own account interface. The Lab never picks a model. It compares **runs**: the same input sent before and after a model change, or sent twice |
| Model names | A run shows the model or provider the platform reports. Where the platform reports none, it shows the **model label** you typed, marked as yours. With neither, it shows "(not reported)" |
| Memory | Kept for the session only. A reload starts empty |

## Modalities

Every generation modality Player2 offers. Platform plumbing (asset projects, NPCs, game data, Minecraft) is not included.

| Modality | You give it | You get back |
|---|---|---|
| Chat | messages, temperature, max tokens, JSON mode, tools | text (streamed or whole), plus the name of the model that answered |
| Embeddings | text, a model, dimensions | vectors |
| Text to speech | text, voice(s), speed, format, delivery instructions | audio, plus whether the instructions were carried out |
| Speech to text | an audio file or a mic recording, language | transcript, confidence, word timings |
| Image generate | prompt, size | image |
| Image edit | prompt, one or more images, aspect ratio or size | image |
| Video | prompt, aspect ratio, optional start image | video |
| Music | prompt, duration, instrumental switch | audio |
| 3D | prompt, or an image | a model shown in a 3D viewer |

## What you do

| Action | Result |
|---|---|
| Open the page | It connects through the local Player2 app and shows connection status and joule balance |
| Pick a modality | The input form for that modality appears, with that modality's model label |
| Set the model label | Optional free text naming what is selected in Player2 for this modality. It is stamped on every run until changed, and each modality keeps its own |
| Run | The output appears in the right player for its type: text, audio, image, video or 3D |
| Run again, or change the model in Player2 and run again | A new run appears. Old runs stay |
| Compare | Two or more runs of the same modality are shown side by side. Inputs that differ are highlighted, and so is the model name when it differs |
| Inspect a run | Shows the exact request and response, how long it took, joules spent, and the model/voice the platform reports |
| Run a slow job (video, music, 3D) | It shows its progress and doesn't block anything else. Several can run at once |
| Send a TTS output to STT | The audio goes straight into speech-to-text as the input |

## Every run records

- modality and inputs
- output
- the model or provider the platform reports, where it reports one (chat and embeddings report a model; TTS reports its provider only when delivery instructions are sent)
- the voice(s) sent, for TTS
- the model label, if one was set
- duration
- joules spent
