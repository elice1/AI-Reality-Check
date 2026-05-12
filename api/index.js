export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ status: "AI Reality Check API running ✓" });
}
