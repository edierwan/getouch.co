# qwen3:30b Evaluation For WAPI AI Stack (2026-04-26)

## Scope And Guardrails

- Installed `qwen3:30b` only.
- Did not install `qwen3-coder`.
- Did not remove any existing models.
- Did not change the default model.
- Did not change production WAPI routing.
- Did not restart Ollama or Open WebUI.

## Environment Checked

- Host: Ubuntu 24.04.4 LTS on `100.84.14.93`
- Hardware: 64 GB RAM, NVIDIA GeForce RTX 5060 Ti 16 GB VRAM
- Ollama location: Docker container `ollama`
- Open WebUI location: Docker container `open-webui`
- Open WebUI to Ollama path: `http://ollama:11434`
- Ollama model store: `/srv/apps/ai/ollama`

## Disk Space Before And After

| Mount | Before | After | Delta |
| --- | --- | --- | --- |
| `/srv` | `161G` used, `1.3T` avail, `12%` | `185G` used, `1.3T` avail, `13%` | about `+24G` used |
| `/` | `18G` used, `76G` avail, `19%` | `18G` used, `76G` avail, `19%` | no material change |

## Pull Result

- Command path: `docker exec ollama ollama pull qwen3:30b`
- Result: success
- Pull elapsed: `31:51.51`

## Installed Models After Pull

- `qwen3:30b`
- `gemma3:latest`
- `llama3.2-vision:latest`
- `qwen3-vl:32b`
- `gemma3:12b`
- `llama3.2-vision:11b`
- `nomic-embed-text:latest`
- `qwen2.5vl:32b`
- `mistral:7b`
- `gemma2:9b`
- `llama3.1:8b`
- `qwen2.5:14b`
- `all-minilm:latest`
- `qwen3:14b`

## Runtime Notes

- Before testing, `qwen3:14b` was already pinned in Ollama as `100% GPU` and using about `9.4 GB` VRAM.
- The first cold `ollama run qwen3:30b ...` attempt was not practical while `qwen3:14b` remained loaded.
- After unloading `qwen3:14b`, Ollama reported `qwen3:30b` resident as `17%/83% CPU/GPU`, with GPU memory around `15.4 GB / 16.3 GB`.
- This means `qwen3:30b` is usable on this host, but only through mixed offload with very little GPU headroom.

## CLI Smoke Result

- `docker exec ollama ollama run qwen3:30b ...` did not return promptly on the first cold-switch attempt while `qwen3:14b` was still pinned on GPU.
- That is an operational warning for WAPI use: model switching into `qwen3:30b` is materially less practical than `qwen3:14b` on this 16 GB GPU.
- For stable, repeatable prompt timing after the model was loaded, the same Ollama backend was tested through non-streaming `POST /api/generate` calls from the `open-webui` container.

## Prompt Results

### Prompt 1

Prompt: `Reply in Malay. Explain WAPI in 3 short sentences as an AI WhatsApp assistant for SMEs.`

`qwen3:30b`

> WAPI ialah sistem rasmi WhatsApp untuk perniagaan, membolehkan SMEs berkomunikasi dengan pelanggan melalui platform yang sah dan dipercayai.
> Ia membolehkan automasi seperti jawapan pantas, pengurusan pesanan, dan notifikasi untuk meningkatkan kecekapan operasi.
> Dengan WAPI, SMEs boleh memberikan pengalaman pelanggan yang lebih baik sambil mempercepatkan interaksi bisnes.

- total duration: `21.69s`
- load duration: `0.14s`
- eval duration: `15.00s`
- assessment: strongest fit to instruction; concise, clear, natural, and kept to 3 short sentences

`qwen3:14b`

> WAPI ialah asisten AI berdasarkan WhatsApp yang membantu SME memproses permintaan pelanggan secara automatik, seperti menjawab soalan dan menghantar notifikasi. Ia menyokong pengintegrasian dengan sistem kewangan dan CRM untuk memudahkan pengurusan operasi. Dengan WAPI, SME boleh meningkatkan kecepatan respons dan pengalaman pelanggan tanpa perlu tambahan tenaga kerja.

- total duration: `21.42s`
- load duration: `5.85s`
- eval duration: `9.50s`
- assessment: acceptable Malay, but more formal and more lecture-like; ignored the 3 short sentences constraint

### Prompt 2

Prompt: `You are a clinic receptionist AI. A customer asks: 'blood test esok ada slot tak?' Reply naturally in Malay, ask only one useful follow-up question.`

`qwen3:30b`

> Saya boleh check untuk awak. Untuk jenis ujian darah apa? (e.g. darah penuh, gula, dll.)

- total duration: `11.02s`
- load duration: `0.09s`
- eval duration: `10.10s`
- assessment: safest answer of the two; natural Malay and exactly one useful follow-up question

`qwen3:14b`

> Terdapat kekosongan untuk ujian darah esok. Boleh beri nama atau nombor telefon pesakit untuk kami buat tempahan?

- total duration: `3.82s`
- load duration: `0.11s`
- eval duration: `3.47s`
- assessment: faster, but it hallucinated availability instead of qualifying first; operationally riskier for reception use

### Prompt 3

Prompt: `You are a property sales assistant AI. A customer asks: 'rumah bawah 300k ada tak area sungai petani?' Reply naturally in Malay and qualify the lead.`

`qwen3:30b`

> Hai, terima kasih kerana bertanya! Untuk rumah di area Sungai Petani dengan harga bawah RM300,000, saya perlu tahu sedikit lagi supaya boleh bantu cari yang sesuai... Saya boleh check senarai terkini untuk anda.

- total duration: `21.74s`
- load duration: `0.09s`
- eval duration: `20.34s`
- assessment: friendlier and more local in tone, but over-qualified the lead with too many questions and extra fluff

`qwen3:14b`

> Terdapat beberapa pilihan rumah di bawah RM300,000 di kawasan Sungai Petani, tetapi ketersediaannya bergantung pada keperluan spesifik... Adakah anda mencari rumah teres, rumah semi-d, atau jenis lain?

- total duration: `8.87s`
- load duration: `0.10s`
- eval duration: `8.30s`
- assessment: shorter than `qwen3:30b`, but still too formal and still asks too much for a natural lead-qualification reply

## Comparison With qwen3:14b

### Quality

- `qwen3:30b` was better on prompt 1 and prompt 2.
- `qwen3:30b` had more natural Malay and better instruction-following on the clinic prompt.
- `qwen3:14b` remained noticeably more formal and more likely to sound scripted.
- On the property prompt, both models over-asked, but `qwen3:30b` was more conversational while `qwen3:14b` was drier and more templated.

### Speed And Practicality

- `qwen3:14b` is operationally much safer on this hardware.
- `qwen3:30b` needed mixed CPU/GPU offload and consumed nearly all available VRAM.
- `qwen3:30b` also showed a poor cold-switch experience when another model was already pinned.
- Warm-response latency for `qwen3:30b` remained materially slower than `qwen3:14b` on prompt 2 and prompt 3.

## Open WebUI Visibility

- Before pull: `qwen3:30b` was not visible.
- After pull: Open WebUI model cache refresh via `GET /api/models?refresh=true` exposed both:
  - `qwen3:14b`
  - `qwen3:30b`
- Restart performed: none

## Recommendation

- Recommendation category: `test-only, non-default`
- Keep `qwen3:14b` as the practical default for now.
- Allow `qwen3:30b` only for controlled manual testing where higher answer quality is worth slower response and mixed CPU/GPU offload.
- Do not route production WAPI traffic to `qwen3:30b` by default on this host unless a safe per-request model selector already exists and the use case explicitly tolerates slower replies.

## WAPI Usage Policy Note

- `qwen3:30b` is viable as an optional evaluation model above `qwen3:14b`.
- It is not a practical replacement on the current RTX 5060 Ti 16 GB host for general WAPI workloads.
- If future testing is needed, prefer limited admin-only or evaluator-only exposure instead of a platform-wide default switch.

## Optional Dify Note

- `qwen3:30b` can be tested through the same Ollama backend and any OpenAI-compatible path that already fronts Ollama.
- It should remain non-default in Dify or WAPI-facing flows until a safe selector exists and response-time expectations are explicitly relaxed.