import * as crypto from "crypto";
import * as fs from "fs";

import * as request from "request-promise";

import { download } from "./download";
import { exec, sanitizeFileName } from "./utils";

export function isForgeInstalled(directory: string, minecraftVersion: string): boolean
{
	return fs.existsSync(directory + "/minecraft_server." + minecraftVersion + ".jar");
}

export async function getLatestForgeVersion(minecraftVersion: string): Promise<string|null>
{
	const url = "https://files.minecraftforge.net/maven/net/minecraftforge/forge/index_" + minecraftVersion + ".html";
	const data = await request.get(url);
	const urlMatch = data.match(/\/maven\/[^"]+forge-([^"]+)-installer\.jar/);
	if (urlMatch == null) { return null; }

	return urlMatch[1];
}

export function getInstalledForgeVersion(directory: string): string|null
{
	const fileName = getInstalledForgeFileName(directory);
	if (fileName == null) { return null; }

	const match = fileName.match(/^forge-([0-9\.-]+)-installer\.jar$/);
	return match != null ? match[1] : null;
}

export function getInstalledForgeFileName(directory: string): string|null
{
	const files = fs.readdirSync(directory);
	for (const fileName of files)
	{
		const match = fileName.match(/^forge-[0-9\.-]+-installer\.jar$/);
		if (match == null) { continue; }

		return match[0];
	}

	return null;
}

export function getInstalledMinecraftVersion(directory: string): string|null
{
	const files = fs.readdirSync(directory);
	for (const fileName of files)
	{
		const match = fileName.match(/minecraft_server\.(.+?)\.jar/);
		if (match == null) { continue; }

		return match[1];
	}

	return null;
}

export function getInstalledMinecraftFileName(directory: string): string|null
{
	const files = fs.readdirSync(directory);
	for (const fileName of files)
	{
		const match = fileName.match(/minecraft_server\..+?\.jar/);
		if (match == null) { continue; }

		return match[0];
	}

	return null;
}

export async function uninstallServer(directory: string, log: (_: string) => void): Promise<boolean>
{
	const forgeFile = getInstalledForgeFileName(directory);

	if (forgeFile)
	{
		await exec("rm", [forgeFile], { cwd: directory });
		log("Removed old forge JAR.");
	}

	const mcFile = getInstalledMinecraftFileName(directory);

	if (mcFile)
	{
		await exec("rm", [mcFile], { cwd: directory });
		log("Removed old minecraft JAR.");
	}

	if (fs.existsSync(directory + "/libraries"))
	{
		await exec("rm", ["-rf", "libraries"], { cwd: directory });
		log("Removed old libraries directory.");
	}

	return true;
}

export async function installForge(directory: string, minecraftVersion: string, forgeVersion: string|null, log: (_: string) => void): Promise<string|null>
{
	if (!fs.existsSync(directory))
	{
		log("Creating " + directory + "...");
		fs.mkdirSync(directory);
	}

	if (forgeVersion == null)
	{
		forgeVersion = await getLatestForgeVersion(minecraftVersion);
		if (forgeVersion == null)
		{
			log("Failed to find forge installer jar for Minecraft " + minecraftVersion + "!");
			return null;
		}
	}

	const installerUrl = "https://files.minecraftforge.net/maven/net/minecraftforge/forge/" + forgeVersion + "/forge-" + forgeVersion + "-installer.jar";
	log("Downloading " + installerUrl + "...");
	let [installerJar, fileName] = await download(installerUrl);
	fileName = sanitizeFileName(fileName);
	fs.writeFileSync(directory + "/" + fileName, installerJar);

	log("Running " + fileName + "...");
	await exec("java", ["-jar", fileName, "--installServer"], {"maxBuffer": 1024 * 1024 * 20, cwd: directory });

	return forgeVersion;
}

export async function installLauncher(directory: string, log: (_: string) => void): Promise<void>
{
	if (!fs.existsSync(directory + "/jmxremote.password"))
	{
		fs.writeFileSync(directory + "/jmxremote.password",
			"monitorRole " + crypto.randomBytes(16).toString("hex") + "\n" +
			"controlRole " + crypto.randomBytes(16).toString("hex") + "\n");
		fs.chmodSync(directory + "/jmxremote.password", 0o400);

		log("Wrote " + directory + "/jmxremote.password");
	}

	if (!fs.existsSync(directory + "/start.sh"))
	{
		// Memory
		let javaArguments = "-Xmx28672M -Xms28672M";

		// JMX monitoring
		javaArguments += " -Dcom.sun.management.jmxremote";
		javaArguments += " -Dcom.sun.management.jmxremote.ssl=false";
		javaArguments += " -Dcom.sun.management.jmxremote.authenticate=true";
		javaArguments += " -Dcom.sun.management.jmxremote.port=9010";
		javaArguments += " -Dcom.sun.management.jmxremote.rmi.port=9010";
		javaArguments += " -Dcom.sun.management.jmxremote.password.file=${curdir}/jmxremote.password";

		// GC
		javaArguments += " -XX:ParallelGCThreads=8 -XX:InitiatingHeapOccupancyPercent=10 -XX:AllocatePrefetchStyle=1 -XX:+UseSuperWord -XX:+OptimizeFill -XX:LoopUnrollMin=4 -XX:LoopMaxUnroll=16 -XX:+UseLoopPredicate -XX:+RangeCheckElimination -XX:+CMSCleanOnEnter -XX:+EliminateLocks -XX:+DoEscapeAnalysis -XX:+TieredCompilation -XX:+UseCodeCacheFlushing -XX:+UseFastJNIAccessors -XX:+CMSScavengeBeforeRemark -XX:+ExplicitGCInvokesConcurrentAndUnloadsClasses -XX:+ScavengeBeforeFullGC -XX:+AlwaysPreTouch -XX:+UseFastAccessorMethods -XX:+UnlockExperimentalVMOptions -XX:G1HeapWastePercent=10 -XX:G1MaxNewSizePercent=10 -XX:G1HeapRegionSize=32M -XX:G1NewSizePercent=10 -XX:MaxGCPauseMillis=100 -XX:+OptimizeStringConcat -XX:+UseParNewGC -XX:+UseNUMA -XX:+UseCompressedOops -XX:+UseConcMarkSweepGC -XX:+CMSClassUnloadingEnabled -XX:SurvivorRatio=2 -XX:+DisableExplicitGC";

		// Timeout
		javaArguments += " -Dfml.readTimeout=120";

		const minecraftArguments = "";

		fs.writeFileSync(directory + "/start.sh",
			"#!/bin/bash\n" +
			"curdir=\"${0%/*}\"\n" +
			"jar=\"${curdir}/`ls ${curdir} | grep universal.jar`\"\n" +
			"\n" +
			"java " + javaArguments + " -jar \"${jar}\" " + minecraftArguments + "\n"
		);
		fs.chmodSync(directory + "/start.sh", 0o744);

		log("Wrote " + directory + "/start.sh");
	}
}
