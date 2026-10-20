FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY proto ./proto
RUN mkdir -p app && python -m grpc_tools.protoc -I./proto --python_out=./app --grpc_python_out=./app ./proto/decision.proto
COPY app ./app
ENV PYTHONPATH=/app/app
EXPOSE 8000 50051
CMD ["python", "-m", "app.main"]

