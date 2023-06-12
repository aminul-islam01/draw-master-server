const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.PAYMENT_SECTERT_KEY)
require('dotenv').config()
const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aws78to.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db("draw-masterDB").collection("users");
        const classesCollection = client.db("draw-masterDB").collection("classes");
        const cartsCollection = client.db("draw-masterDB").collection("carts");
        const paymentsCollection = client.db("draw-masterDB").collection("payments");

        app.post('/jsonwebtoken', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token })
        })

        // user collection operation start here
        app.get('/popular-instructor', async (req, res) => {
            const result = await usersCollection.find().limit(6).toArray();
            res.send(result);
        })

        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' };
            const result = await usersCollection.find(query).toArray();
            res.send(result)
        })

        app.get('/all-users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        })

        app.get('/users/role/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ user: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);

            if (user.role === 'admin') {
                return res.send({ role: "admin" })
            } else if (user.role === 'instructor') {
                return res.send({ role: "instructor" })
            } else {
                return res.send({ role: "student" })
            }
        })


        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/user/admin', async (req, res) => {
            const user = req.body;
            const id = user._id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.patch('/user/instructor', async (req, res) => {
            const user = req.body;
            const id = user._id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        // classes collection operation start here
        app.get('/popular-classes', async (req, res) => {
            const query = { status: 'approved' }

            const options = {
                sort: { student: -1 }
            }
            const cursor = classesCollection.find(query, options).limit(6);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/all-classes', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        })

        app.get('/classes', async (req, res) => {
            const query = { status: 'approved' };
            const result = await classesCollection.find(query).toArray();
            res.send(result)
        })

        app.get('/instructors-classes', async (req, res) => {
            const email = req.query.email;
            const query = { instructorEmail: email };
            const result = await classesCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/classes', async (req, res) => {
            const classes = req.body;
            const result = await classesCollection.insertOne(classes);
            res.send(result)
        })

        app.patch('/approve-class', async (req, res) => {
            const approveClass = req.body;
            const id = approveClass._id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        app.patch('/deny-class', async (req, res) => {
            const denyClass = req.body;
            const id = denyClass._id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied'
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        app.patch('/feedback-class', async (req, res) => {
            const feedbackClass = req.body;
            const id = feedbackClass._id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    feedback: feedbackClass.feedback
                }
            }
            const result = classesCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // carts collection operation start here
        app.post('/cart-classes', async (req, res) => {
            const selectedClass = req.body;

            const query = { id: selectedClass.id }
            const existing = await cartsCollection.findOne(query);

            if (existing) {
                return res.send('this class already selected');
            }
            const result = await cartsCollection.insertOne(selectedClass);
            res.send(result)
        })

        app.get('/card-class/:id', async(req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await cartsCollection.findOne(query);
            res.send(result);
        })

        app.get('/selected-classes', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartsCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/delete-classes/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartsCollection.deleteOne(query);
            res.send(result)
        })

        // create payment intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // payment collection operation start here 
        app.post('/payments', async(req, res) => {
            const payment = req.body;
            const result = paymentsCollection.insertOne(payment);
            res.send(result)
        })



        console.log("You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('draw-master-server is running')
})
app.listen(port, () => {
    console.log(`draw-master-server is running on port ${port}`)
})
