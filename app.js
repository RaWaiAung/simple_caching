require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const redis = require('redis');

const app = express();

const { BASE_URL } = process.env;
//Middleware
app.use(bodyParser.json());

let redisClient;

(async () => {
    redisClient = redis.createClient();
    redisClient.on("error", (error) => console.error(`Error: ${error}`));
    await redisClient.connect();
})();

const isCachedData = async (req, res, next) => {
    try {
        const characterId = req.params.id;
        let redisKey = "hogwarts-characters";
        if (characterId) {
            redisKey = `hogwarts-character-${characterId}`;
        }
        const cachedResult = await redisClient.get(redisKey);
        if (cachedResult) {
            res.status(200).json({
                success: true,
                fromCache: true,
                data: JSON.parse(cachedResult)
            })
        } else {
            next();
        }
    } catch (error) {
        res.status(404)
    }
}

const fetchDataFromApi = async (characterId) => {
    let apiUrl;
    if (characterId) {
        apiUrl = `${BASE_URL}/character/${characterId}`;
    } else {
        apiUrl = `${BASE_URL}/characters`
    }
    const result = await axios.get(apiUrl);

    return result.data;
}

app.get('/hogwarts/characters/:id', isCachedData, async (req, res, next) => {
    try {
        const redisKey = `hogwarts-character-${req.params.id}`;
        let results;
        let isCached = false;
        const cachedResult = await redisClient.get(redisKey);
        if (cachedResult) {
            isCached = true;
            results = JSON.parse(cachedResult);
        } else {
            results = await fetchDataFromApi(req.params.id);
            if (!results.length) {
                throw new Error("Data unavailable");
            }
            await redisClient.set(redisKey, JSON.stringify(results), {
                EX: 120,
                NX: true
            });
        }
        return res.status(200).send({
            fromCache: isCached,
            data: results,
        });
    } catch (error) {
        console.log(error);
        res.status(404).send("Data unavailable");
    }
});

app.get('/hogwarts/characters', isCachedData, async (req, res, next) => {
    try {
        const redisKey = "hogwarts-characters";
        let results;
        let isCached = false;

        results = await fetchDataFromApi();
        if (!results.length) {
            res.status(400).json({
                success: false,
                message: 'Data is not available'
            });
        }

        await redisClient.set(redisKey, JSON.stringify(results), {
            EX: 120,
            NX: true
        });


        res.status(200).json({
            success: true,
            fromCache: isCached,
            data: results
        });

    } catch (err) {
        res.status(400).send(err);
    }
});

app.listen(8000, () => {
    console.log('server started!');
});