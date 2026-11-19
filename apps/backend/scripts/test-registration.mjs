import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { resolve } from "node:path";
const backend = fileURLToPath(new URL("../", import.meta.url));
const values = { ...process.env }, flag = process.argv.indexOf("--env-file");
const envFile = flag >= 0 ? process.argv[flag+1] : resolve(backend,"../../.env");
if (!envFile) throw Error("--env-file requires a path");
expand({ ...config({path:envFile,processEnv:values,quiet:true}),processEnv:values });
const original = new URL(values.DATABASE_URL);
if (!["localhost","127.0.0.1","[::1]"].includes(original.hostname)) throw Error("Local PostgreSQL only");
const database = "lumigap_registration_test";
if (original.pathname === `/${database}`) throw Error("Provide the application URL; this runner derives an isolated test database");
const adminUrl=new URL(original);adminUrl.pathname="/postgres";
const admin=new Client({connectionString:adminUrl.href,connectionTimeoutMillis:10000});
try{await admin.connect();if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1",[database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`);}finally{await admin.end();}
const testUrl=new URL(original);testUrl.pathname=`/${database}`;
const redis=new URL(values.REDIS_URL);if(!["localhost","127.0.0.1","[::1]"].includes(redis.hostname))throw Error("Local Redis only");redis.pathname="/14";
const env={...values,DATABASE_URL:testUrl.href,REDIS_URL:redis.href,NODE_ENV:"test",REGISTRATION_INTEGRATION:"1",RATE_LIMIT_STORE:"memory",EMAIL_DELIVERY_MODE:"disabled",LOG_LEVEL:"error"};
async function run(args){const p=spawn(process.execPath,args,{cwd:backend,env,shell:false,windowsHide:true,stdio:"inherit"});await new Promise((r,j)=>{p.on("error",j);p.on("exit",c=>c===0?r():j(Error(`Registration checks failed (${c})`)));});}
await run(["../../node_modules/prisma/build/index.js","migrate","deploy","--config","prisma7.config.ts"]);
await run(["../../node_modules/vitest/vitest.mjs","run","src/modules/auth/__tests__/registration.persistence.test.ts","src/modules/auth/__tests__/auth-mail.service.test.ts","--maxWorkers=1","--minWorkers=1","--testTimeout=60000"]);
