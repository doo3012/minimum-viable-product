async function test() {
  const cookieRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: "naratorndoo@gmail.com", password: "P@ssw0rd" })
  });
  const cookie = cookieRes.headers.get('set-cookie');
  
  const staffRes = await fetch('http://localhost:3000/api/staff', {
    headers: { 'Cookie': cookie }
  });
  const data = await staffRes.json();
  console.dir(data, { depth: null });
}
test();
