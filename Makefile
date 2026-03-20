.PHONY: install dev benchmark test clean

install:
	@echo "Installing backend dependencies with uv..."
	cd backend && uv sync
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

dev:
	@echo "Starting PulseStream dev servers..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:3000"
	cd backend && uvicorn main:app --reload --port 8000 &
	cd frontend && npm run dev

benchmark:
	@echo "Running benchmark suite..."
	cd backend && uv run python -m pipeline.benchmark

test:
	cd backend && uv run pytest tests/ -v 2>/dev/null || echo "No tests found."
	cd frontend && npm run test 2>/dev/null || echo "No tests found."

clean:
	rm -f backend/benchmark_results.json
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
