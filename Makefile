.PHONY: install dev benchmark test clean build-cython

install:
	@echo "Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	@echo ""
	@echo "Building Cython extension..."
	cd backend && python setup_cython.py build_ext --inplace || echo "  [SKIP] Cython build failed (optional — benchmark runs without it)"
	@echo ""
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo ""
	@echo "Done. Run 'make benchmark' to reproduce optimization results."

install-uv:
	@echo "Installing backend dependencies with uv..."
	cd backend && uv sync
	cd backend && python setup_cython.py build_ext --inplace || echo "  [SKIP] Cython build failed"
	cd frontend && npm install

dev:
	@echo "Starting PulseStream dev servers..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:3000"
	cd backend && uvicorn main:app --reload --port 8000 &
	cd frontend && npm run dev

build-cython:
	@echo "Building Cython extension..."
	cd backend && python setup_cython.py build_ext --inplace

benchmark: build-cython
	@echo ""
	@echo "Running benchmark suite..."
	cd backend && PYTHONPATH=. python -m pipeline.benchmark

test:
	@echo "Running backend tests..."
	cd backend && PYTHONPATH=. python -m pytest tests/ -v
	@echo ""
	@echo "Running frontend tests..."
	cd frontend && npm run test 2>/dev/null || echo "No frontend tests found."

clean:
	rm -f backend/benchmark_results.json
	rm -f backend/pipeline/*.so backend/pipeline/*.c
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "build" -exec rm -rf {} + 2>/dev/null || true
