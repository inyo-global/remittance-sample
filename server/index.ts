import { createApp } from './app.ts';

const { app, ctx } = createApp();

app.listen(ctx.config.port, () => {
    console.log(`Server running on port ${ctx.config.port}`);
});

// Keep process alive hack
setInterval(() => {}, 1 << 30);
