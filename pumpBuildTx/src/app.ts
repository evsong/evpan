// src/app.ts
import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { pumpCreateAndBuy, pumpBuy, pumpSell } from "./pump";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import base58 from "bs58";
import { VersionedTransaction } from "@solana/web3.js";
import { createTable } from "./database/database";

const app = express();
const port = 3456;
app.use(bodyParser.json());

createTable();

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, TypeScript Express!");
});

app.post("/api/trade-local", async (req: Request, res: Response) => {
  console.log(req.body);
  const reqData = req.body;
  let resP: string[] = [];
  // const tx = VersionedTransaction.deserialize(
  //   new Uint8Array(base58.decode("2Rugsrv5wUToi1Vhrqdxgm7MPYgXwF19yHAYigktnfZwM7wCV2qqCq3EuUa6uby5xSRBrWXF1ZENEQmQjxbdvGjCSeGa8MhU55MzrujpKJ2vGPBvVHFStaAfK3SkuM9XzMpV2x23G2bDrVS9zPkzBtHCKBZvQkaZXi79nEGZXxhRjnC5m6xLyjnu52Y9iQn2FjcgBwuvxdQocFL5DP2x7T39MrMDiLwFVfoeYPZG8sf97LrWNUbmdVtpvbnHSextEAQBZ6TYGiK7TaQLzmktqLpS1tXuVahUAACtgsE6kBx3GQoutJQocKcdtq2eRMZDnjigJGkLT86SPBwiqfBh8dNYddh97KemwZCrqwFdVsQCPdZmfc8rgu63Aesgsi8hA4uDN29WccnvyHF3htQiscBopz1UNzYwgrbDQCqnZfY6tX59q8zQykp6caPXbRijW9PuoC3XNnfnP68ekZ6hvN4KvpAqepTHRcNmhdGavWogTRi6dJHEPJN6yvbJdPzLxFFpU2brpGTRqMz3na14UyBeiKHxBz5oocE3YEZKA3qeWjdD8ETPvDownPycxaiyxiwtaM3Y8gyVAGaN1cuHnZ4XeJpTu2ZJykqLYAeziiB8bFmYRXp4msH1jgdowwyAPW6HFXELdMSP6eAVnYJSje6gY25K6wHBZEesiy7uWYnfb5WC6rRDyb3SCDyBkxFoU675J4BSJyv5NMhRm2p4XuG8CNHk5sVcRy49P3XfETonfuu51k7NxozWNkDNKsnYpDtb9Ka3te4c2J8u7a4HanPooVVresHT43YHrT4Vc1qC2Nu5XUpc8oyVgD1VpVheLcDqeAxHEyfDynjWHf7eNHya31v5ghL1XqDtgcyW8tAoRhspLRq3AF2tWbAAyxGBZmpXaFF3fm164Ad33ZuagCyV"))
  // );
  // console.log(tx);
  try {
    let payJito = true; // 标志变量，用于判断是否是第一个元素
    for (const t of reqData) {
      if (t.action == "create") {
        const cab = await pumpCreateAndBuy(
          t.publicKey,
          t.action,
          t.tokenMetadata,
          t.mint,
          t.denominatedInSol,
          t.amount,
          t.slippage,
          t.priorityFee,
          t.pool
        );
        payJito = false;
        console.log(bs58.encode(cab.serialize()));
        resP.push(bs58.encode(cab.serialize()));
      } else if (t.action == "buy") {
        const cab = await pumpBuy(
          t.publicKey,
          t.action,
          t.mint,
          t.denominatedInSol,
          t.amount,
          t.slippage,
          t.priorityFee,
          t.pool,
          payJito
        );
        payJito = false;
        console.log(bs58.encode(cab.serialize()));
        resP.push(bs58.encode(cab.serialize()));
      } else if (t.action == "sell") {
        const cab = await pumpSell(
          t.publicKey,
          t.action,
          t.mint,
          t.denominatedInSol,
          t.amount,
          t.slippage,
          t.priorityFee,
          t.pool,
          payJito
        );
        payJito = false;
        console.log(bs58.encode(cab.serialize()));
        resP.push(bs58.encode(cab.serialize()));
      }
    }
    res.send(resP);
  } catch (e) {
    console.log("错误:", e);
    res.send({ msg: "出现错误" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
