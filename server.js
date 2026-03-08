const app = require('./api/index');
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[LOCAL DEV] DROPZONE Server running on PORT ${PORT}`);
  console.log(`[LOCAL DEV] Testing Vercel architecture locally`);
});
