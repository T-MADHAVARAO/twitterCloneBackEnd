const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db;

initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server running on port");
    });
  } catch (error) {
    console.log(`DB Error:${error}`);
  }
};
initializeDbAndServer();

const userCheckingWhileRegistration = async (req, res, next) => {
  const userDetails = req.body;
  const { username, password, name, gender } = userDetails;
  const checkUserQuery = `select * from user where username="${username}";`;
  const isUser = await db.get(checkUserQuery);
  if (isUser !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else {
    const passwordLen = password.length;
    if (passwordLen < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      next();
    }
  }
};

app.post("/register", userCheckingWhileRegistration, async (req, res) => {
  const userDetails = req.body;
  const { username, password, name, gender } = userDetails;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userRegisterQuery = `INSERT INTO user (name,username,password,gender) VALUES ("${name}","${username}","${hashedPassword}","${gender}");`;
  const dbResponse = await db.run(userRegisterQuery);
  res.status(200);
  res.send("User created successfully");
});

const loginUser = async (req, res, next) => {
  const loginData = req.body;
  const { username, password } = loginData;
  const haveUserQuery = `select * from user where username="${username}";`;
  const isUser = await db.get(haveUserQuery);
  if (isUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    try {
      const hash = isUser.password;
      const result = await bcrypt.compare(password, hash);
      if (!result) {
        res.status(400);
        res.send("Invalid password");
      } else {
        next();
      }
    } catch (e) {
      console.log("Error while compare password");
    }
  }
};

app.post("/login", loginUser, async (req, res) => {
  const jwtToken = jwt.sign({ username: req.body.username }, "MADHAV_SIRI");
  res.send({ jwtToken });
});

const authUser = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (authHeader === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    const jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      res.status(401);
      res.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MADHAV_SIRI", async (error, user) => {
        if (error) {
          res.status(401);
          res.send("Invalid JWT Token");
        } else {
          req.user = user;
          next();
        }
      });
    }
  }
};

app.get("/user/tweets/feed/", authUser, async (req, res) => {
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const query = `SELECT u.username, t.tweet, t.date_time
FROM tweet t
INNER JOIN follower f ON t.user_id = f.following_user_id
INNER JOIN user u ON f.following_user_id = u.user_id
WHERE f.follower_user_id = ${currentUserId}
ORDER BY t.date_time DESC
LIMIT 4;
`;
  const data = await db.all(query);
  const updatedData = data.map((each) => ({
    username: each.username,
    tweet: each.tweet,
    dateTime: each.date_time,
  }));

  res.send(updatedData);
});

app.get("/user/following/", authUser, async (req, res) => {
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const query = `SELECT u.username as name
FROM user u
INNER JOIN follower f ON u.user_id = f.following_user_id
WHERE f.follower_user_id = ${currentUserId};`;
  const data = await db.all(query);
  res.send(data);
});

app.get("/user/followers/", authUser, async (req, res) => {
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const query = `SELECT u.username as name
FROM user u
INNER JOIN follower f ON u.user_id = f.follower_user_id
WHERE f.following_user_id = ${currentUserId};
`;
  const data = await db.all(query);
  res.send(data);
});

const authenticateUserForTweet = async (req, res, next) => {
  const { tweetId } = req.params;
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;

  const tweetDetails = await db.get(
    `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
  );

  if (tweetDetails === undefined) {
    res.status(404);
    res.send("Tweet not found");
  } else {
    if (tweetDetails.user_id !== currentUserId) {
      res.status(401);
      res.send("Invalid Request");
    } else {
      next();
    }
  }
};

app.get(
  "/tweets/:tweetId/",
  authUser,
  authenticateUserForTweet,
  async (req, res) => {
    const { tweetId } = req.params;

    const tweetDetails = await db.get(
      `SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};`
    );

    const likesCount = await db.get(
      `SELECT COUNT(*) as count FROM like WHERE tweet_id = ${tweetId};`
    );

    const repliesCount = await db.get(
      `SELECT COUNT(*) as count FROM reply WHERE tweet_id = ${tweetId};`
    );

    res.json({
      tweet: tweetDetails.tweet,
      likes: likesCount.count,
      replies: repliesCount.count,
      dateTime: tweetDetails.date_time,
    });
  }
);

const authenticateUserForLikes = async (req, res, next) => {
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const { tweetId } = req.params;

  const tweetDetails = await db.get(
    `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
  );

  if (tweetDetails === undefined) {
    res.status(404).json("Tweet not found");
  } else if (tweetDetails.user_id !== currentUserId) {
    res.status(401).json("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/likes/",
  authUser,
  authenticateUserForTweet,
  async (req, res) => {
    const { tweetId } = req.params;

    const likeUsernames = await db.all(
      `SELECT u.username
     FROM like l
     INNER JOIN user u ON l.user_id = u.user_id
     WHERE l.tweet_id = ${tweetId}`
    );

    const likes = likeUsernames.map((like) => like.username);

    res.json({ likes });
  }
);

const authenticateUserForReplies = async (req, res, next) => {
  const { tweetId } = req.params;
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const tweetDetails = await db.get(
    `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
  );

  if (tweetDetails === undefined) {
    res.status(404).json("Tweet not found");
  } else if (tweetDetails.user_id !== currentUserId) {
    res.status(401).json("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/replies/",
  authUser,
  authenticateUserForTweet,
  async (req, res) => {
    const { tweetId } = req.params;

    const replies = await db.all(
      `SELECT u.username as name, r.reply
     FROM reply r INNER JOIN user u ON r.user_id=u.user_id
     WHERE tweet_id = ${tweetId}`
    );

    res.json({ replies });
  }
);

app.get("/user/tweets/", authUser, async (req, res) => {
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const userTweets = await db.all(
    `SELECT tweet, date_time, 
            (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes, 
            (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies
     FROM tweet 
     WHERE user_id = ${currentUserId}`
  );

  const formattedTweets = userTweets.map((tweet) => ({
    tweet: tweet.tweet,
    likes: tweet.likes,
    replies: tweet.replies,
    dateTime: tweet.date_time,
  }));

  res.json(formattedTweets);
});

app.post("/user/tweets/", authUser, async (req, res) => {
  const { tweet } = req.body;
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;

  if (!tweet || !currentUserId) {
    res.status(400);
    res.send("Bad Request: Missing tweet or userId");
    return;
  } else {
    const date_time = new Date().toISOString(); // Get the current date and time

    try {
      const insertTweetQuery = `
      INSERT INTO tweet (tweet, user_id, date_time)
      VALUES ("${tweet}","${currentUserId}","${date_time}");
    `;

      await db.run(insertTweetQuery);
      res.status(201)
      res.send("Created a Tweet");
    } catch (error) {
      console.error("Error creating tweet:", error);
      res.status(500).json("Internal Server Error");
    }
  }
});

const authenticateUserForTweetDeletion = async (req, res, next) => {
  const { tweetId } = req.params;
  const currentUser = req.user.username;
  const activeUserQuery = `select * from user where username="${currentUser}"`;
  const activeUser = await db.get(activeUserQuery);
  const currentUserId = activeUser.user_id;
  const tweetDetails = await db.get(
    `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
  );

  if (tweetDetails.user_id !== currentUserId) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    next();
  }
};

app.delete(
  "/tweets/:tweetId/",
  authUser,
  authenticateUserForTweet,
  async (req, res) => {
    const { tweetId } = req.params;

    try {
      await db.run(`DELETE FROM tweet WHERE tweet_id = ${tweetId}`);
      res.send("Tweet Removed");
    } catch (error) {
      res.status(500);
      res.send("Internal Server Error");
    }
  }
);

module.exports = app;
