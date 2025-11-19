let sockets = new Set<WebSocket>();

Deno.serve((req) => {
  const url = new URL(req.url);

  // 1. WebSocket Upgrade (Real-time Connection)
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      sockets.add(socket);
      console.log("New player connected!");
    };

    socket.onmessage = (event) => {
      // Broadcast message to ALL players
      for (const s of sockets) {
        s.send(event.data);
      }
    };

    socket.onclose = () => {
      sockets.delete(socket);
    };

    return response;
  }

  // 2. Frontend UI
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Multiplayer Table</title>
    <style>
      body { background: #1b5e20; color: white; text-align: center; font-family: sans-serif; }
      .table { margin-top: 20px; min-height: 200px; }
      .card { 
        display: inline-block; 
        width: 60px; height: 90px; 
        background: white; color: black; 
        border-radius: 5px; margin: 5px; 
        padding-top: 30px; font-weight: bold; font-size: 20px;
        box-shadow: 2px 2px 5px rgba(0,0,0,0.5);
        animation: pop 0.3s ease-out;
      }
      @keyframes pop { from { transform: scale(0); } to { transform: scale(1); } }
      button { padding: 15px 30px; font-size: 18px; background: #ff6f00; color: white; border: none; border-radius: 30px; margin-top: 20px; cursor: pointer; }
    </style>
  </head>
  <body>
    <h3>Multiplayer Room (Live)</h3>
    <div class="table" id="tableArea">
      <p style="opacity: 0.7;">Waiting for players...</p>
    </div>
    <button onclick="drawCard()">DRAW CARD</button>

    <script>
      // Connect to Deno WebSocket
      const ws = new WebSocket(location.href.replace("http", "ws"));

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // If someone drew a card, show it on MY screen too
        if (data.type === "card") {
          const table = document.getElementById("tableArea");
          if (table.querySelector('p')) table.innerHTML = ''; // Remove waiting text
          
          const cardDiv = document.createElement("div");
          cardDiv.className = "card";
          cardDiv.style.color = (data.suit === "♥️" || data.suit === "♦️") ? "red" : "black";
          cardDiv.innerHTML = data.rank + "<br>" + data.suit;
          table.appendChild(cardDiv);
        }
      };

      function drawCard() {
        const suits = ["♠️", "♥️", "♣️", "♦️"];
        const ranks = ["A", "K", "Q", "J", "10", "9", "8"];
        
        const randomSuit = suits[Math.floor(Math.random() * suits.length)];
        const randomRank = ranks[Math.floor(Math.random() * ranks.length)];

        // Send to Server (Everyone will see this)
        ws.send(JSON.stringify({ type: "card", suit: randomSuit, rank: randomRank }));
      }
    </script>
  </body>
  </html>
  `;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
