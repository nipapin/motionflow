import Replicate from "replicate";
import fs from "node:fs";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});