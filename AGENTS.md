# Repository Guidelines

## Project Structure & Module Organization

`Model/` contains the Python FastAPI and gRPC service. Request validation, XML assembly, Webui defaults lookup, and Laya inference live in `Model/app/core.py`; the REST and gRPC entry points live in `Model/app/main.py`. The gRPC contract is `Model/proto/decision.proto`, and model tests are in `Model/tests/`. `Webui/` is an Astro server application: pages and API routes are under `Webui/src/pages/`, while SQLite, authentication, and health sampling live in `Webui/src/lib/`. `docker-compose.yml` connects both services and persists SQLite and model downloads in volumes.

## Build, Test, and Development Commands

- `docker compose up --build -d`: build and start both services; Webui is at `http://localhost:4321`.
- `docker compose logs -f model webui`: inspect startup, inference, and Webui errors.
- `cd Webui && npm install && npm run dev`: run the Astro UI locally. Set the environment values from `.env` and start Model separately.
- `cd Webui && npm run build`: check the production Astro build.
- `PYTHONPATH=Model python -m unittest discover -s Model/tests`: run model contract tests after installing `Model/requirements.txt`.

## Coding Style & Naming Conventions

Use four spaces in Python and two spaces in TypeScript, JavaScript, and Astro. Use `snake_case` for Python names and API fields; use `camelCase` for JavaScript variables and functions. Keep REST and gRPC field names stable when changing the UI. All user facing text, default instructions, and model criteria must be Spanish. Laya inference remains pinned to `model="multilingual"` and `lang="es"`. No formatter or linter is configured; keep changes focused and run the checks above.

## Testing Guidelines

Name Python tests `test_*.py` and cover behavior at service boundaries: input limits, company defaults, instruction overrides, XML escaping, and unchanged Laya output. Add focused tests for new model behavior. For Webui changes, build Astro and manually check the affected tab and API route; there is no configured browser test suite or coverage threshold.

## Commit & Pull Request Guidelines

No Git history is available in this workspace, so there is no established commit convention. Use short imperative subjects such as `Add company instruction defaults`. Pull requests should describe behavior and database migrations, list commands run, link relevant issues, and include screenshots for visible UI changes.

## Security & Configuration

Never commit `.env`, SQLite files, credentials, or model downloads. Keep the generated admin password and API tokens private. Database changes must preserve existing company settings and migrate existing SQLite volumes safely.
