import Replicate from 'replicate'
import dotenv from 'dotenv'
dotenv.config()

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
  userAgent: 'https://www.npmjs.com/package/create-replicate'
})
const model = 'bytedance/seedance-1-pro-fast:155d6d446da5e7cd4a2ef72725461ba8687bdf63a2a1fb7bb574f25af24dc7b5'
const input = {
  fps: 24,
  prompt: 'high speed supercar driving on the beach at sunset',
  duration: 5,
  resolution: '1080p',
  aspect_ratio: '16:9',
  camera_fixed: false,
}

console.log('Using model: %s', model)
console.log('With input: %O', input)

console.log('Running...')
const output = await replicate.run(model, { input })
console.log('Done!', output)
