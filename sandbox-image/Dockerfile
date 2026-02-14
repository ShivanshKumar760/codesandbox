FROM node:18-alpine

WORKDIR /workspace

RUN adduser -D sandboxuser \
    && chown -R sandboxuser:sandboxuser /workspace

USER sandboxuser

CMD ["tail", "-f", "/dev/null"]
