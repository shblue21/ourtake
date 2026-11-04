# OurTake

**Everyone’s footage. The story you want to tell.**

An English-language React studio that turns footage from different perspectives into an intentional story. Upload clips, describe your direction, review a real edit, and refine it in conversation.

## Run locally

Requirements: Node.js 22.12+ or 24+, npm, FFmpeg and ffprobe.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:4317**. On macOS, install FFmpeg with `brew install ffmpeg` if needed. Set `FFMPEG_PATH` and `FFPROBE_PATH` in `.env` if the binaries are not on PATH.

For a production build served locally:

```sh
npm run build
npm start
```

## Connect Meta later

A blank `.env` has been prepared in this checkout. For another checkout, copy `.env.example` to `.env` first. Set:

```dotenv
MODEL_API_KEY=your-key-here
META_MODEL=muse-spark-1.2
```

Restart the server and refresh the page. The API key stays on the server: it is never put in the client bundle, browser storage, project files, or logs. `.env` and local footage are gitignored.

The default is Muse Spark 1.2 because the Meta video/audio guide retrieved on November 3, 2026 explicitly notes incomplete audio support in Spark 1.3. Change `META_MODEL` to evaluate another available model. **Meta direct was live-tested on November 4, 2026 with the three bundled CC0 clips: analysis, intent changes, locked revisions and actual MP4 exports succeeded after the JSON-mode compatibility fix below. This does not establish general editorial quality or multicamera/person understanding.**

## Use Baseten instead

OurTake also supports **Meta Muse Spark Open hosted by Baseten**. Add these server-side values to `.env`:

```dotenv
BASETEN_API_KEY=your-baseten-key-here
BASETEN_MODEL=meta-models/muse-spark-open
```

Restart the server, open **Settings**, and select **Baseten**. If only the Baseten key is configured, it is the default AI provider. If both keys are configured, Meta direct remains the default and you can select either. Blank placeholders have been added to this checkout without replacing existing values. Never paste your key into a chat or client-side source.

Baseten uses `https://inference.baseten.co/v1/chat/completions`, inline `video_url` data, a separate MP3 `audio_url` when the clip has sound, and `response_format: json_schema`. We do not assume the video encoder reads embedded audio. It returns a plan; the existing source validation, locks and FFmpeg renderer still execute it.

- No public video URL or additional storage account is required. Media is encoded in the request to Baseten; Meta Files upload/deletion is not used for this provider.
- This adapter limits each clip to **300 seconds** and combined preview media (including estimated extracted audio) to **50 MiB**. It checks the encoded request against a **72 MiB** app limit before sending. These conservative inline limits are app policy, not Baseten's published URL-upload limit. Larger inputs are rejected explicitly; no hidden truncation or provider fallback.
- Meta's hosting guide documents a maximum of 96 sampled video frames per clip. Video support does not establish precise event timing or reliable understanding of long footage. Short clips are preferable for initial quality checks; automatic chunking is not implemented.
- Switching providers reanalyzes footage and starts a new edit. Existing versions retain their provider/model and remain playable. A version cannot be revised using another provider's analysis.
- A configured key is not a successful connection test. The adapter has mocked transport and real-media integration coverage, but live account access, video/audio compatibility, schema support, inference quality and cost still require your key.

References: [Meta's Baseten hosting guide](https://dev.meta.ai/docs/muse-spark-open/deploy), [Baseten Chat Completions schema](https://docs.baseten.co/reference/inference-api/llm-openapi-spec.json), [Muse Spark Open prompting](https://dev.meta.ai/docs/muse-spark-open/prompting). Checked November 3, 2026.

## Explore without a key

The first screen includes a playable, pre-rendered film using real CC0 footage. Choose **Explore this example** or **Example film** to open its footage and editable timeline in a new project. It does not overwrite your existing project.

The example is a curated montage from three different places and times, not a synchronized event and not a recorded AI run. Sample mode revisions are predefined rules, clearly labeled. Footage and adaptation details are in `public/demo/credits.html`.

For your own footage: upload clips, enter a brief, and choose **Make my story**. Preparation, analysis, planning and rendering run in one job. The same flow works in sample mode (evenly divided scenes) or Meta direct/Baseten mode (real model calls). There is no separate analysis button.

Sample revisions include: shorten the last shot, extend the last shot, focus on preparation, and focus on the main character. Other requests require Meta mode. The synthetic illustrations are kept only as internal test fixtures (`fixture: synthetic`).

## What is implemented

- Multiple local uploads, thumbnails, browser-compatible preview proxies, and media validation.
- Server-side Meta Files/Responses and Baseten Chat Completions adapters. Meta uses JSON-object output with a schema in the prompt and local contract validation; Baseten uses native strict JSON-schema output plus the same local validation. Live Muse Spark 1.2 strict decoding produced whitespace loops/corrupt enum values, so Meta uses the verified JSON-mode path with explicit low reasoning effort.
- Per-source scene analysis. Planning receives the analysis and the source preview videos again so the model can inspect the actual footage across views.
- Evidence-referenced edit plans: scene IDs, source-local ranges, selection reasons, and cross-scene observations with uncertainty.
- Validation rejects missing scenes, out-of-range cuts, invalid evidence references and changes to locked shots.
- FFmpeg renders real H.264/AAC 720p MP4s, normalizes aspect ratios with letterboxing, adds silence for silent inputs, and applies short audio fades at cuts.
- Playback, actual cut-in thumbnails, a moving playhead and scrubbing, hold-to-see-original at the corresponding source time, an inspection drawer, saved versions and MP4 downloads.
- Side-by-side version comparison highlights added, moved, trimmed, unchanged and removed shots. Restore changes the active version without deleting history.
- Optional measured audio balancing: bounded RMS gain with a peak guard and 80ms-or-shorter fades at cuts. This is not a continuous master-audio track or a certified LUFS normalizer.
- Natural-language revisions and explicit shot locks. A lock freezes the slot, source and exact range. Invalid changes fail without replacing the previous output.
- Each version preserves its scene snapshot. Reanalyzing footage requires a new cut rather than revising a plan against changed scene IDs.
- Persistent projects in `.data/`. The library can open or delete projects; deletion asks for confirmation.

## Current boundaries

This is an intent-driven montage editor, not a frame-accurate automatic multicam synchronization system. It supports continuous selected speech across visual cuts. It does not yet implement automatic multicamera synchronization, automatic color matching, music generation, captions, or hosted share links. Target duration is a creative target, not a guarantee when source footage is insufficient.

Limits: eight source videos per project; 500MB and 20 minutes per file; validated plans up to 40 shots and 10 minutes; the interface offers target lengths up to two minutes. Jobs run in server memory. Completed projects survive restarts; interrupted jobs must be restarted.

Model observations and relationship explanations are not independently verified facts. Source/time validation prevents invalid media references but cannot establish whether an inferred identity, emotion, or causal link is true.

## Data flow

- Originals and rendered videos remain in the local `.data/` directory until the project is deleted.
- Uploading alone does not send footage to Meta. Running analysis or editing in Meta direct mode uploads 960px/24fps preview copies, including embedded audio.
- Uploaded Meta copies receive a one-hour expiration. The server requests their deletion after each operation, including on failure.
- Media, filenames, subtitles and speech are treated as untrusted evidence, not model instructions. Model output is validated and never executed as a shell command.
- This server binds to `127.0.0.1` and checks Host and Origin. It has no public-service authentication, tenant isolation or durable distributed job queue. Keep it local until deployment controls are implemented.

## Verification

```sh
npm test
npm run test:integration
npm run build
```

The unit/contract tests cover hallucinated source IDs, invalid ranges, locked-shot mutation, incomplete/refused model responses, the Meta video request contract, and uploaded-file cleanup on success and error. Meta and Baseten responses are mocked: these tests do not certify live API compatibility. Baseten coverage checks provider key separation, inline video/audio, structured output, payload limits, error sanitization and absence of cross-provider fallback.

The integration test uses real FFmpeg to generate synthetic test footage, analyze in sample mode, render and download an MP4, revise a locked plan, retrieve actual shot thumbnails, restore an earlier version without losing history, and delete a test project. It also uploads a portrait clip with real audio through multipart, runs the combined analysis/render flow in one request, renders it with normalized dimensions, and checks range requests and thumbnails from a hidden storage folder. Test files live in a temporary directory and are cleaned up.

Before claiming the AI experience works, compare two different intentions on the same real footage, inspect original evidence, add misleading clips, and check that a local revision preserves unrelated shots.

## Project map

- `src/App.jsx`: React studio
- `src/styles.css`: responsive studio UI
- `src/components/`: progress rail, shot timeline and version comparison
- `src/edit-diff.js`: one-to-one shot matching and timeline/source mapping
- `server/experience.js`: curated real-footage example
- `public/demo/`: CC0 footage excerpts, preview and media credits
- `server/index.js`: local API, uploads and job state
- `server/meta.js`: provider dispatch, Meta adapter, prompts and sample rules
- `server/baseten.js`: Baseten video/audio encoding, payload limits and Chat Completions adapter
- `server/plans.js`: schemas, source validation and shot locks
- `server/media.js`: FFmpeg/ffprobe processing
- `server/store.js`: local project persistence

API references: [Video understanding](https://dev.meta.ai/docs/video-understanding), [Structured output](https://dev.meta.ai/docs/structured-output), [File handling](https://dev.meta.ai/docs/file-handling).

## Speech-led editing

Meta direct edits now transcribe audio with `muse-voice-transcribe-1.0` and pass timed speech turns to the configured editing model (currently `muse-spark-1.3-contributor` in this local installation). Each source transcript is reused for subsequent edits. Silent sources are skipped. Baseten does not silently use the Meta transcription service.

The story-outline pass selects source-backed story parts, with optional speech from whole turns. The picture pass realizes those parts around the fixed speech timeline; it cannot shorten or replace selected words to fit its cuts. The server derives source ranges and text from those turns, rejects missing references, overlapping tracks and speech beyond the visual edit, and preserves speech heard over locked shots. FFmpeg keeps selected speech continuous across picture cuts and replaces competing source audio during those intervals. Outside selected speech intervals, the existing shot audio remains.

Speech recognition provides **turn-level**, not word-level or verified sentence-level timing. Recognition, punctuation, diarization and semantic completeness can be wrong; check the original using the quoted speech in **Inside the edit**. A source/chunk boundary can truncate a thought. The planner is instructed to avoid incomplete boundary turns and to retain context. This is not forced alignment or a guarantee of quotation accuracy. The editor can choose not to use speech when it does not fit the intent.

Meta receives temporary mono 24 kHz PCM WAV audio through `/v1/asr/transcribe`; local WAVs are removed after the request. Audio longer than ten minutes is processed in bounded chunks; speaker labels are scoped to each source and chunk, not matched across files. Errors are surfaced rather than replaced with invented transcripts. Existing local videos and versions remain playable.

For revisions, the planner preserves unrelated material for local changes but may rebuild unlocked shots and speech when the user changes the story direction. Version comparison includes an audio selector and selected-speech duration.

Reference: [Meta speech-to-text documentation](https://dev.meta.ai/docs/speech-to-text), checked November 4, 2026.

## Perspective-led story construction

Every AI edit now builds a story outline, including silent footage. Per-source analysis feeds a project-wide context with local subjects, evidence-backed moments, and links distinguished as the same event, before/after, reaction, or merely thematic. These are model interpretations, not verified identity or causal facts. The context is cached against the source analysis, transcripts, provider and model; new footage or analysis invalidates it. No graph database or global face identity store is used.

The outline identifies a person, process or theme, an ordered set of story parts, the moments/scenes/turns supporting each part, and missing evidence. Uncertain links cannot be used as factual story evidence. Every rendered picture cut must reference its story part and one of its permitted scenes; every part must appear in order. Validation checks references and structure, not whether the model understood the event correctly.

**Change perspective** rebuilds unlocked story structure while retaining the comparison parent. Kept shots are not silently released. **Refine this edit** requests a local change. When footage or provider changes, existing locks must be explicitly released before a fresh perspective can be created. Earlier versions retain their scene and context snapshots. Older versions without outlines remain playable and comparable; the UI does not invent story metadata for them.

The studio shows the focus, story parts, source links and missing evidence. Comparison shows both outlines and added/removed moments only when they share the same context snapshot. A changed understanding is labelled instead of matching unrelated moment IDs.

Implementation: `server/context.js` validates collection evidence; `server/narrative.js` validates story-to-cut correspondence; `server/meta.js` orchestrates context, outline and picture planning; `src/components/StoryOutline.jsx` and `StoryComparison.jsx` expose the story and evidence. The existing renderer, speech timing, cut locks and version persistence are reused.
