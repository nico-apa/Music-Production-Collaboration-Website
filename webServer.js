const { MongoClient, ServerApiVersion, UUID } = require('mongodb'),
      { Server } = require("socket.io"),
      b_parser = require("body-parser"),
      express = require('express'),
      http = require('http'),
      path = require('path'),
      uuid = require('uuid');
    
require("dotenv").config({path: path.resolve(__dirname, './assets/.env')})

// const { type } = require('os');

async function serverConfigAndStart() {

    /* Creates the object that will configure the http server, 
     * then creates the object that actually represents our server, 
     * then wraps the socket manager around our http server so it can
     * monitor connecting sockets and manage them */
    const app = express();
          http_server = http.createServer(app),
          socketManager = new Server(http_server);

    /* Extracts these environment variables from the process */
    const name = (process.env).MONGO_USERNAME,
          password = (process.env).MONGO_PASSWORD,
          database_name = (process.env).DATABASE,
          database_collection = (process.env).COLLECTION;

    const uri = `mongodb+srv://${name}:${password}@projects.y9tuif0.mongodb.net/?retryWrites=true&w=majority`,
          client = new MongoClient(uri, {
              serverApi: {
                  version: ServerApiVersion.v1,
                  strict: true,
                  deprecationErrors: true,
              }});

    //   , DOMAIN = "localhost:5000";

    /* We'll wait for connection to DB. This is done because we want
     * to connect to the DB before we setup and start the server */
    await client.connect();

    const sessions_db = client.db(database_name).collection(database_collection);

    /* Whenever a socket connects with the server, call this anonymous function passing in that socket */
    socketManager.on("connection", (connecting_socket) => {

        /* Giving the connecting socket this event handler. Whenever the client-end of this socket
         * emits this event, they will send over two IDs: the ID of the socket room we want to join,
         * and the ID of the client's PeerJS object. We want to broadcast that PeerJS ID to every socket
         * in the room
         */
        connecting_socket.on('join-room', (sessID, peerID) => {
            
            /* Broadcast to everyone else in the room my PeerJS object ID so they can communicate with me */
            connecting_socket.to(sessID).emit('viewer joining', peerID);

            /* Add socket to their room */
            connecting_socket.join(sessID);
        });

        /* Giving the connecting socket this event handler. RIGHT BEFORE the socket is fully
         * deleted/ disconnected (for whatever reason), this anonymous function will be called 
         * so that we can broadcast to the room it's in that it's leaving  */
        connecting_socket.on("disconnecting", (reason) => {

            /* Iterate through every element of the set of rooms this socket is in */
            for (let sessID of connecting_socket.rooms) {

                /* If the current room is equal to the socket's id, then skip */
                if (sessID === connecting_socket.id) { continue; }

                /* Broadcast to the other sockets in the room so that they can remove user from list on client side */
                connecting_socket.to(sessID).emit("viewer leaving");
            
                /* Leave the room this socket is a part of  */
                connecting_socket.leave(sessID);
            }
    
        });
    });

    /* Sets destination of where the templates are and specifies which type of engine we'll use */
    app.set("views", path.resolve(__dirname, "./templates"));
    app.set("view engine", "ejs");

    /* Use this middleware to read POST body */
    app.use(b_parser.urlencoded({extended: false}))

    /* This endpoint handles all of the css GET requests */
    app.get('/assets/:stylesheet', (req, res) => {

        /* Gets the the desired css file name from the request parameter */
        let css_file = (req.params).stylesheet;
        res.sendFile(path.resolve(__dirname, `./assets/${css_file}`));
    });

    /* This endpoint handles the GET request made when wanting to retrieve the start page */
    app.get("/", (req, res) => {

        res.render("index");
    });

    /* This endpoint handles the GET request made when wanting to retrieve the join page */
    app.get("/join", (req, res) => {

        res.render("joinPage");
    });

    /* This endpoint handles the GET request made when client filtered using tags */
    app.get("/join/public", async (req, res) => {

            /* Three possible values for 'genre_q_args': 
             *
             *         UNDEFINED if no query arguments were sent ('.query' points to empty object),
             *         STRING if 1 query argument was sent (genresTag='rap')
             *         OBJECT if more than 1 query argument with the same key (genresTag=['rap', 'pop', 'rnb'])
             */
        let genre_q_args = (req.query).genreTags, 
            filter = { visibility: "public" }, cursor, all_public_sessions;

        if (typeof genre_q_args === "string") { filter = { ...filter, genre: genre_q_args}; }
        else if (typeof genre_q_args === "object") { filter = { ...filter, genre: {$in: genre_q_args} }; }
    
        /* Database lookup */
        cursor = await sessions_db.find(filter);
        all_public_sessions = await cursor.toArray();

        res.json(all_public_sessions);
    });

    app.get("/join/private", async (req, res) => {

        let sessionID = req.query.sessionID;

        res.redirect(`/session/${sessionID}`);
    });

    app.get("/create", (req, res) => {

        res.render("createConfig");
    });

    app.get("/session/:id", (req, res) => {

        res.render("sessions.ejs", { roomID: (req.params).id });
    });

    app.post("/create/done", async (req, res) => {

        /* Just realized that mongoDB already creates an ID for your
         * object by default, should I even use the UUID library then */

        /* Creates a random, yet unique ID */
        const session_id = uuid.v4();

        /* TODO: sanitize user input */
        let sess = { ...(req.body), sessionID: session_id };

        /* Insert session created into database */
        await sessions_db.insertOne(sess);

        /* Will perform a GET request to this endpoint (I think) as if the clients made it */
        res.redirect(`/session/${session_id}`);
    });

    console.log("Web server listening on port: 5000")

    /* Function call will actually start the server/ program that listens to requests being made to it. */
    http_server.listen(5000);
}

serverConfigAndStart();