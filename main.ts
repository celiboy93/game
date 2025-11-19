// Card Deck Setup
const SUITS = ["♠️", "♥️", "♣️", "♦️"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function getRandomCard() {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  
  let value = 0;
  if (["J", "Q", "K", "10"].includes(rank)) {
    value = 0;
  } else if (rank === "A") {
    value = 1;
  } else {
    value = parseInt(rank);
  }
  
  return { suit, rank, value };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // API: Deal Cards
  if (url.pathname === "/api/deal") {
    const card1 = getRandomCard();
    const card2 = getRandomCard();
    
    // Calculate Shan Koe Mee Points
    let total = (card1.value + card2.value) % 10;
    
    // Determine outcome text
    let resultText = `${total} Points`;
    if (total === 9) resultText = "🔥 KOE MEE (9) 🔥";
    if (total === 8) resultText = "✨ SHAN (8) ✨";

    return new Response(JSON.stringify({
      cards: [card1, card2],
      score: resultText,
      total: total
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Frontend: HTML Game UI
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Deno Shan Koe Mee</title>
    <style>
      body { 
        background-color: #2e7d32; 
        color: white; 
        font-family: sans-serif; 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        justify-content: center; 
        height: 100vh; 
        margin: 0; 
      }
      h1 { margin-bottom: 20px; text-shadow: 2px 2px 4px black; }
      .table { 
        background: #1b5e20; 
        padding: 20px; 
        border-radius: 20px; 
        border: 5px solid #ffd54f; 
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        text-align: center;
        width: 300px;
      }
      .cards-container { 
        display: flex; 
        justify-content: center; 
        gap: 15px; 
        margin: 20px 0; 
        min-height: 140px;
      }
      .card { 
        background: white; 
        color: black; 
        width: 80px; 
        height: 120px; 
        border-radius: 10px; 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        justify-content: center; 
        font-size: 24px; 
        font-weight: bold; 
        box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
        transition: transform 0.3s;
      }
      .card.red { color: #d32f2f; }
      .card.black { color: #212121; }
      .result { font-size: 24px; font-weight: bold; color: #ffd54f; min-height: 30px; margin-bottom: 15px; }
      button { 
        background: #ff6f00; 
        color: white; 
        border: none; 
        padding: 12px 30px; 
        font-size: 18px; 
        border-radius: 50px; 
        cursor: pointer; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      }
      button:active { transform: scale(0.95); }
    </style>
  </head>
  <body>
    <h1>Shan Koe Mee</h1>
    
    <div class="table">
      <div class="result" id="scoreText">Press Deal to Start</div>
      
      <div class="cards-container" id="cardArea">
        <div class="card" style="background: #ddd;">?</div>
        <div class="card" style="background: #ddd;">?</div>
      </div>

      <button onclick="playGame()">DEAL CARDS</button>
    </div>

    <script>
      async function playGame() {
        const cardArea = document.getElementById('cardArea');
        const scoreText = document.getElementById('scoreText');
        
        scoreText.innerText = "Dealing...";
        
        // Fetch random cards from Deno server
        const res = await fetch('/api/deal');
        const data = await res.json();
        
        // Update UI
        cardArea.innerHTML = '';
        data.cards.forEach(card => {
          const colorClass = (card.suit === "♥️" || card.suit === "♦️") ? "red" : "black";
          
          const cardDiv = document.createElement('div');
          cardDiv.className = \`card \${colorClass}\`;
          cardDiv.innerHTML = \`
            <div>\${card.rank}</div>
            <div style="font-size: 30px;">\${card.suit}</div>
          \`;
          cardArea.appendChild(cardDiv);
        });

        scoreText.innerText = data.score;
      }
    </script>
  </body>
  </html>
  `;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
