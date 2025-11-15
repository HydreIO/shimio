import Server from "../src/Server.js";
import Client from "../src/Client.js";
import stream from "stream";
import { promisify } from "util";
import fs from "fs";
import Koa from "koa";

const pipeline = promisify(stream.pipeline);
const read = fs.createReadStream("example/hello.txt", {
  highWaterMark: 2000,
});
const write = fs.createWriteStream("example/world.txt");
const client = Client({ host: "ws://0.0.0.0:3000" });
const server = Server({
  koa: new Koa(),
  on_upgrade: () => true,
  on_socket: ({ socket }) => {
    socket.on("channel", async (channel) => {
      for await (const chunk of channel.read) await channel.write(chunk);
    });
  },
  timeout: 20,
});

await server.listen(3000);
await client.connect();

const channel = await client.open_channel(); // noop
const round_trip = async function* (source) {
  const iterator = channel.read[Symbol.asyncIterator]();

  for await (const chunk of source) {
    await channel.write(chunk);
    yield (await iterator.next()).value;
  }
};

await pipeline(read, round_trip, write);
client.disconnect();
await server.close();
