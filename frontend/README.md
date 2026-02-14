# bun-react-tailwind-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

API proxy upstream (optional):

```bash
export API_UPSTREAM_BASE_URL=http://127.0.0.1:4000
```

Or use a `.env` file:

```dotenv
API_UPSTREAM_BASE_URL=http://127.0.0.1:4000
```

Frontend requests always hit `/api/*` on this Bun server (`localhost:3000`), and Bun forwards them to the configured upstream.

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
