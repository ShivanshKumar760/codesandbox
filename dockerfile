# Pull official PostgreSQL image from Docker Hub
FROM postgres:16

# Environment variables
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_DB=code_sandbox

# Expose PostgreSQL port
EXPOSE 5432
