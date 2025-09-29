import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import axios from 'axios';
import dotenv from "dotenv";
import session from 'express-session';
import bcrypt from 'bcrypt';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.API_KEY;

app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  cookie: {maxAge: 1000 * 60 * 60 * 24}
}));

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

db.connect(err => {
    if (err) {
        return console.error('Could not connect to the database', err);
    } else {
        console.log('Connected to the database');
    }
});

app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// homepage
app.get("/", (req, res) => {
  res.render("index.ejs", { results: null, message: null });
});

// registration page
app.get("/register", (req, res) => {
  res.render("register.ejs", { message : null });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [username, hashedPassword]);
    res.redirect("/login");
  } catch (err) {
    console.error("Error occurred during registration:", err);
    res.render("register.ejs", {message: "Username already taken or error occurred."});
  }
});

// login page
app.get("/login", (req, res) => {
  res.render("login.ejs", {message: null});
});

app.post("/login", async (req, res) => {
  const {username, password} = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return res.render("login.ejs", {message: "Invalid username or password."});
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (match) {
      req.session.userId = user.id; // Make sure user.id is stored
      req.session.username = user.username;
      res.redirect("/");
    } else {
      res.render("login.ejs", {message: "Invalid username or password."});
    }
  } catch (err) {
    console.error(err);
    res.render("login.ejs", { message: "Something went wrong." });
  }
});


// logout route
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Error occurred during logout:", err);
    }
    res.redirect("/login");
  })
});


// recipes food
app.get("/recipe/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const response = await axios.get(
      `https://api.spoonacular.com/recipes/${id}/information`,
      { params: { apiKey: apiKey } }
    );
    const recipe = response.data;
    res.render("recipe.ejs", { recipe });
  } catch (error) {
    console.error("Error fetching recipe details:", error);
    res.redirect("/");
  }
});


// removing favs
app.post("/favorites/remove/:id", isLoggedIn, async (req, res) => { // Added isLoggedIn middleware
  const { id } = req.params;
  const userId = req.session.userId; // Get userId from session
  try {
    // Only delete the favorite for the current user
    await db.query("DELETE FROM favorites WHERE recipe_id = $1 AND user_id = $2", [id, userId]);

    res.redirect("/favorites");
  } catch (err) {
    console.error("Error removing favorite:", err);
    res.redirect("/favorites");
  }
});

// search
app.post("/search", async (req, res) => {
    const query = req.body.query;
    const url = `https://api.spoonacular.com/recipes/complexSearch?query=${query}&number=10&apiKey=${apiKey}`;
    try {
        const response = await axios.get(url);
        const results = response.data.results;
        res.render("index.ejs", { results: results, message: null, query: query });
    } catch (error) {
        console.error('Error fetching recipes:', error);
        res.render("index.ejs", { results: null, message: 'Error fetching recipes. Please try again later.' });
    }
});

// adding favs
app.post("/favorite/:id", isLoggedIn, async (req, res) => { // Added isLoggedIn middleware
    const { id } = req.params;
    const { title, image } = req.body;
    const userId = req.session.userId; // Get userId from session

    try {
        await db.query(
            "INSERT INTO recipes (recipe_id, title, image_url) VALUES ($1, $2, $3) ON CONFLICT (recipe_id) DO UPDATE SET title = EXCLUDED.title, image_url = EXCLUDED.image_url",
            [id, title, image]
        );

        
        await db.query(
            "INSERT INTO favorites (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT (user_id, recipe_id) DO NOTHING",
            [userId, id]
        );

        res.redirect("/favorites");
    } catch (err) {
        console.error("Error adding favorite:", err);
        res.redirect("/"); // Or render an error message
    }
});

// favorites page

function isLoggedIn(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
}

app.get("/favorites", isLoggedIn, async (req, res) => {
    const userId = req.session.userId; // Get userId from session
    try {
        const result = await db.query(
            `SELECT r.recipe_id, r.title, r.image_url
             FROM recipes r
             INNER JOIN favorites f ON r.recipe_id = f.recipe_id
             WHERE f.user_id = $1`, // Filter by user_id
            [userId]
        );
        const favorites = result.rows;
        res.render("favorites.ejs", { favorites: favorites });
    } catch (err) {
        console.error("Error fetching favorites:", err);
        res.redirect("/");
    }
});

app.listen(port, (err) => {
    if (err) {
        return console.log('Could not start server', err);
    } else {
        console.log(`Server is listening on ${port}`);
    }
});