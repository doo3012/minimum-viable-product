const axios = require('axios');
async function test() {
  try {
    const res = await axios({
      method: "DELETE",
      url: "http://localhost:5000/api/business-units/bc7e8d57-d3a6-423a-a3c8-adf8fa7b9ea6",
      headers: { "Content-Type": "application/json" },
      data: "", // this is what req.text() returns for empty body
      validateStatus: () => true
    });
    console.log(res.status);
  } catch (err) {
    console.error("error:", err.message);
  }
}
test();
