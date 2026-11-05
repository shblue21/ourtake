# OurTake

**Everyone’s footage. The story you want to tell.**

OurTake turns a collection of clips into an MP4 edit shaped by your direction. Upload footage, choose a person, process or theme to focus on, review the source-linked story, and refine the result. The studio supports shot locks, saved edits, comparisons and speech that continues across picture cuts.

Built for the Meta Global AI Developer Hackathon 2026. See [contribution notes](HACKATHON.txt) and [recorded API-run examples](DEMO_EVIDENCE.json).

## Run locally

Requires Node.js 22.12+ and FFmpeg/ffprobe on PATH. On macOS, install FFmpeg with `brew install ffmpeg`.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. No API key is needed to explore the bundled example. It is a curated CC0 montage; sample-mode edits use preset rules. [Footage credits](public/demo/credits.html).

To serve a production build locally:

```sh
npm run build
npm start
```

## Connect Meta

Copy `.env.example` to `.env` and set:

```dotenv
MODEL_API_KEY=your-key-here
META_MODEL=muse-spark-1.3-contributor
```

Restart the server and refresh the page. Muse Spark handles video understanding and story decisions; Muse Voice Transcribe 1.0 supplies speech timing. The demo video uses this configuration with saved results from real API runs.

Keys stay on the server. Do not commit `.env`. Contributor mode may allow provider use of submitted content for training; choose an appropriate model and footage you can share.

## Optional: Baseten

Add these values to `.env`, restart, and select **Baseten** in Settings:

```dotenv
BASETEN_API_KEY=your-baseten-key-here
BASETEN_MODEL=meta-models/muse-spark-open-1026
```

The model name follows the [hackathon participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details). This adapter has mocked transport and media integration tests, but has not been verified with live inference. It sends preview videos and extracted audio directly to Baseten, and does not use Meta’s transcription service.

Baseten inputs are limited to five minutes per clip and 50 MiB of combined preview media. `BASETEN_MODEL` can be overridden for another deployment.

## Scope and data

- A local, single-user React/Node prototype using FFmpeg for 720p MP4 exports. It has no hosted sharing or public-service authentication.
- Up to eight source videos per project, 500 MiB and 20 minutes per file. Baseten has the smaller limits above.
- No automatic camera synchronization or verified person identification. Model interpretations and speech timestamps can be wrong; review the original footage.
- Originals, edits and project history remain in `.data/` until deleted. Interrupted jobs must be restarted after a server restart.
- Uploading footage to the local app alone does not send it to a provider. Meta edits upload preview video and, for speech recognition, audio. Meta file uploads receive a one-hour expiry; the server also requests their deletion after processing.

## Checks

```sh
npm test
npm run test:integration
npm run build
```

Tests cover model-output validation and editing workflows, including real FFmpeg rendering. Provider responses are mocked; passing tests does not establish live API availability or editorial quality.
