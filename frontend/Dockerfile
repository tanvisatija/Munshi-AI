# --- build -----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Leave empty to call the API on the same origin (nginx proxies /api below).
# Set it when the API lives elsewhere, e.g. --build-arg VITE_API_URL=https://munshi-api.onrender.com
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- serve -----------------------------------------------------------------
FROM nginx:1.27-alpine
# nginx's image renders /etc/nginx/templates/*.template with envsubst at start-up.
ENV BACKEND_URL=http://backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
