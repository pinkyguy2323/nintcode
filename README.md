# NintCode — The Free Local AI Coding Workspace

Бесплатная локальная AI IDE: **Tauri 2 + React + TypeScript + Monaco + xterm.js + Rust + llama.cpp**.
Без подписок, без обязательных API-ключей. Локальные модели работают на GPU пользователя.

## Готовые сборки

Установщики лежат в `installer/`:

| Файл | Тип |
|---|---|
| `NintCode_0.6.0_x64-setup.exe` | NSIS установщик (Windows 10/11 x64) |
| `NintCode_0.6.0_x64_en-US.msi` | MSI |

Портативный exe собирается в `F:\nintcode\src-tauri\target\release\nintcode.exe`.

## Что уже реально работает

- **Окно приложения**: свой titlebar с надёжным перетаскиванием (mousedown + `startDragging`), ресайз за края окна, двойной клик — maximize, тёмная графитовая тема + светлая, масштаб UI, 3 панели с ресайзом (файлы / редактор+терминал / AI-чат) — размеры панелей запоминаются.
- **Рабочие директории**: открытие папки через нативный диалог, дерево файлов, недавние проекты, поиск, git-статус (`git status --short --branch`).
- **Редактор**: Monaco (вкладки, миникарта, подсветка, Ctrl+S, автосейв, Markdown-preview).
- **Терминал**: xterm.js + реальное выполнение команд через Rust (`run_command`, cmd.exe), вывод stdout/stderr, реальный код возврата.
- **AI-чат**: Ask / Plan / Agent, потоковая генерация (SSE), стоп, @-упоминания файлов, `NINTCODE.md`, история между перезапусками.
- **Агент**: реальные инструменты `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`, `search_code`, `create_directory`, `run_terminal_command`, `run_tests`, `inspect_git_diff`; подтверждение опасных действий (удаление, install, rm -rf), запрет доступа вне проекта.
- **Model Hub**: 41 модель с проверенными ссылками — вся практичная семья **Mistral** (Mistral 7B v0.3, Ministral 8B, Mistral Nemo 12B, Mistral Small 3.1 24B, Codestral 22B, Devstral 24B, Mixtral 8x7B), большие (Qwen2.5-Coder 14B/32B, Qwen3 14B/30B-A3B, Gemma 3 12B, Phi-4, StarCoder2 15B, DeepSeek-Coder-V2 Lite, Codestral, Devstral), средние (Gemma 2 9B, GLM-4 9B, DeepSeek-R1-Distill 8B, Qwen3 8B, Granite 3.1, Nemotron Mini 4B), лёгкие и крошечные (Qwen2.5-Coder 0.5B–7B, Qwen3 4B, Llama 3.2 1B/3B, Llama 3.1 8B, Phi-4-mini, Gemma 3 1B/4B, Gemma 2 2B, SmolLM2 360M/1.7B, Yi-Coder). Каждый URL проверен на существование; закрытые/удалённые репозитории не включены. Реальная загрузка GGUF с прогрессом и **докачкой (HTTP Range)**, проверка целостности (магия `GGUF`), импорт локальных GGUF.
- **Hardware**: реальное определение CPU/RAM (sysinfo), GPU (`nvidia-smi`, `wmic`), CUDA (`nvcuda.dll`), Vulkan (`vulkan-1.dll`); режим GPU Only.
- **Режимы мощности**: Performance / Balanced / **Eco (экономия)** — Eco при запуске llama-server даёт мало потоков CPU, idle-приоритет процесса (Windows `IDLE_PRIORITY_CLASS`), контекст 4k и мягкий троттлинг стрима (HTTP back-pressure) — генерация идёт медленнее, но GPU/CPU реально разгружаются. Текущий профиль виден в статус-баре. Плюс **Advanced load control**: слайдер GPU-слоёв (`-ngl`, меньше слоёв = меньше VRAM/RAM) и выбор размера контекста (KV-кэш, 2К–32К).
- **Локальный запуск моделей**: кнопка Run сама ставит и запускает llama.cpp (авто-выбор CUDA/Vulkan/CPU по железу, скачивание официальной nightly-сборки с GitHub, распаковка, health-чек, повторные запуски без задержек).
- **AI Providers**: Base URL + API Key + Model ID для любого OpenAI-совместимого сервера (llama.cpp server, Ollama `:11434/v1`, LM Studio `:1234/v1`), кнопки Test Connection / Fetch Models / Save / Use Model.
- **Настройки**: язык RU/EN, тема, масштаб, папка моделей, права агента, приватность; персист через localStorage (на десктопе доступен Tauri Store) + SQLite-схема в Rust.

## Локальный инференс (бесплатно, на своём GPU)

Полностью автоматический — никаких ручных установок:

1. **Model Hub → Download** — скачает GGUF с Hugging Face во внутреннюю папку.
2. **Run** — приложение само при первом запуске скачает официальный **llama.cpp** (nightly-сборка с GitHub: CUDA 12.4 для NVIDIA, иначе Vulkan, иначе CPU), распакует его во внутреннюю папку и запустит `llama-server` на `:8080`. Дальнейшие запуски — мгновенные. Установить/обновить рантайм заранее можно в **Settings → Hardware → Local inference runtime**, там же показывается статус.
3. Чат сам подключается к `http://127.0.0.1:8080/v1` (OpenAI-совместимый API) — сразу после Run.
4. Если рядом с exe приложения лежит свой `llama-server.exe` (или он есть в PATH) — приложение использует его вместо скачанного.
5. Альтернатива: Ollama или LM Studio — добавьте их в **AI Providers**, они подхватятся сразу.

> Внешние облачные API необязательны. При их использовании NintCode предупреждает, что провайдер может взимать плату.

## Разработка

```powershell
cd nintcode
npm install
npm run dev          # web-preview на http://localhost:1420 (без нативных фич)
npm run typecheck    # tsc --noEmit
npm run build        # tsc + vite build
```

### Сборка десктопа

> ⚠️ Windows RC.EXE не умеет компилировать ресурсы из путей с кириллицей.
> Поэтому используйте скрипт — он зеркалирует проект в ASCII-путь и собирает там:

```powershell
.\build.ps1            # полная сборка + копирование установщиков в .\installer
.\build.ps1 -Dev       # tauri dev
.\build.ps1 -SyncBack  # синхронизировать исходники обратно
```

Или вручную:

```powershell
robocopy . F:\nintcode /E /XD node_modules target dist installer
cd F:\nintcode; npm install; npx tauri build
```

## Структура

```
nintcode/
├── src/                     # React UI
│   ├── components/          # TitleBar, Sidebar, Editor, Terminal, Chat, ModelHub, Providers, Settings, Onboarding, PerfBar
│   ├── lib/                 # tauri.ts (мост), agent.ts (промпты+парсер tool-calls), models-catalog.ts, i18n.ts
│   ├── store.tsx            # глобальный стейт + персист
│   └── types.ts
├── src-tauri/               # Rust backend
│   └── src/main.rs          # FS, терминал, железо, загрузки GGUF, sqlite-схема
├── installer/               # готовые установщики
└── build.ps1                # воспроизводимая сборка
```

## Дорожная карта

- Этап 1 (рабочая основа) — ✅ сделано
- Этап 2 (локальные модели, GPU) — ✅ скачивание/запуск/providers; автоскачивание CUDA-бинарника llama-server в планах
- Этап 3 (агент) — ✅ инструменты, подтверждения, диффы через git
- Этап 4 (API) — ✅ Test / Fetch / Use Model
- Этап 5 (продукт) — ✅ настройки, история, установщики NSIS/MSI; в планах: подписывание exe и ночные сборки.

## Лицензии

Код NintCode — ваш (рекомендуется MIT). Модели имеют собственные лицензии (Apache 2.0, Mistral NPL, DeepSeek и т.д.) — проверяйте перед коммерческим использованием; лицензия указана в карточке каждой модели.
