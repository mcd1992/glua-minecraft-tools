import { ConcurrentManager } from "./libs/concurrency";
import { CurseforgeModRepository } from "./libs/curseforgemodrepository";
import { Document, TableRow } from "./libs/markdown";
import { getModTables, ModTable } from "./libs/mod-table";
import { packModId, parseArguments, readUri } from "./libs/utils";
//import { CurseforgeModRepository } from "./libs/curseforgemodrepository";

async function updateMods(modTable: ModTable): Promise<void>
{
	const concurrency = new ConcurrentManager(15);

	const versions = modTable.getVersions();

	for (let i = 0; i < modTable.getModCount(); i++)
	{
		const [modRepository, id] = modTable.getModId(i)!;
		const modName = modTable.getModName(i)!;
		if (modRepository.name == "url")
		{
			console.error(modName + ": Skipping raw URLs.");
		}
		else
		{
			concurrency.queueTask(async () =>
			{
				const output: string[] = [];
				output.push("Processing " + packModId(modRepository.name, id) + "...");
				for (const version of versions)
				{
					const previousUrl = modTable.getModReleaseUrl(i, version);
					const previousRelease = modTable.getModReleaseId(i, version);
					const [modRepositoryOverride, idOverride, previousReleaseId] = previousRelease ? previousRelease : [modRepository, id, null];
					const nextReleaseId = await modRepositoryOverride.getLatestModReleaseId(idOverride, version);
					const nextUrl = nextReleaseId != null ? modRepositoryOverride.getModReleaseUrl(idOverride, nextReleaseId) : null;

					if (previousUrl != nextUrl)
					{
						let nextAfterPrevious = true;
						if (modRepositoryOverride.name == "curseforge")
						{
							nextAfterPrevious = (previousReleaseId != null ? parseInt(previousReleaseId) : 0) <= (nextReleaseId != null ? parseInt(nextReleaseId) : 0);
						}

						if (nextReleaseId != null && nextAfterPrevious)
						{
							if (previousReleaseId != nextReleaseId)
							{
								// Note that the outer check is for url equality, not release ID equality
								output.push(" " + version + ": " + previousReleaseId + " -> " + nextReleaseId);
							}
							modTable.setModReleaseUrl(i, version, nextUrl);
						}
						else
						{
							// The "latest" release is older than the existing release.
							// Do not update the table.
							output.push(" !!! " + version + ": " + previousReleaseId + " -> " + nextReleaseId + ", rejected!");
						}
					}
				}

				console.error(output.join("\n"));
			});
		}
	}

	await concurrency.join();

	modTable.getTable().formatWidths();
}

/**
 * Parse the manifest.json and move 'no-parent' dependencies underneath their parent mod
 * @param manifestJson a JSON object returned from JSON.parse on a twitch manifest.json
 * @returns a map of the mod name with an object of the mods info + dependencies
 */
async function parseManifest(manifestJson: any): Promise<Map<string, any>>
{
	const concurrency = new ConcurrentManager(15);
	const curseapi = new CurseforgeModRepository();
	const mcVersion = manifestJson.minecraft.version;
	const mods = new Map();

	const findLatestFileId = (modInfo, mcVersion) =>
	{
		for (const file of modInfo.gameVersionLatestFiles)
		{
			if (file.gameVersion == mcVersion)
			{
				return file.projectFileId;
			}
		}
		console.error(`Failed to find matching file for mcVersion:${mcVersion}: [${modInfo.id}] ${modInfo.name}`);
		return null;
	};

	for (const mod of manifestJson.files)
	{
		concurrency.queueTask(async () =>
		{
			/* name, websiteUrl, primaryCategoryId, categories[{categoryId, name}]
			   gameVersionLatestFiles[{gameVersion, projectFileId}] */
			const modInfo = await curseapi.getModInfo(mod.projectID);
			if (modInfo.primaryCategoryId == 421)
			{
				console.error(`Skipping dependency found in manifest.json root: [${modInfo.id}] ${modInfo.name}`);
				return;
			}

			const deps = new Map();
			const modLatestFileId = findLatestFileId(modInfo, mcVersion);
			if (modLatestFileId == null) return;

			const modLatestFileInfo = await curseapi.getFileInfo(modInfo.id, modLatestFileId);
			if (modLatestFileInfo.dependencies.length > 0)
			{
				// Find the latest version of the dependencies too (hopefully no nested dependencies though...)
				for (const dep of modLatestFileInfo.dependencies)
				{
					// dependency type: 0=embedded?, 1=incompatible?, 2=optional, 3=required, 4=tool?
					if (dep.type != 3) continue;

					const depInfo = await curseapi.getModInfo(dep.addonId);
					const depLatestFileId = findLatestFileId(depInfo, mcVersion);
					if (depLatestFileId == null) continue;
					deps.set(depInfo.name, `${depInfo.websiteUrl}/files/${depLatestFileId}`);
				}
			}

			mods.set(modInfo.name, {
				"fileUrl": `${modInfo.websiteUrl}/files/${modLatestFileId}`,
				"dependencies": deps,
			});
		});
	}

	await concurrency.join();
	return mods;
}

async function main(argc: number, argv: string[])
{
	const [fixedArguments, ] = parseArguments(argc, argv);
	if (fixedArguments.length < 2 ||
		(!(fixedArguments[0] == "update" && fixedArguments.length == 2) &&
		!(fixedArguments[0] == "add-version" && fixedArguments.length == 3) &&
		!(fixedArguments[0] == "remove-version" && fixedArguments.length == 3) &&
		!(fixedArguments[0] == "sort" && fixedArguments.length == 2) &&
		!(fixedArguments[0] == "clean" && fixedArguments.length == 2) &&
		!(fixedArguments[0] == "import-manifest" && fixedArguments.length == 3)))
	{
		console.error("Usage: ts-node mods-md update <mods.md file or url> > output.md");
		console.error("       ts-node mods-md add-version <mods.md file or url> <minecraft version> > output.md");
		console.error("       ts-node mods-md remove-version <mods.md file or url> <minecraft version> > output.md");
		console.error("       ts-node mods-md sort <mods.md file or url> > output.md");
		console.error("       ts-node mods-md clean <mods.md file or url> > output.md");
		console.error("       ts-node mods-md import-manifest <mods.md file or url> <manifest.json> > output.md");
		process.exit(1);
	}

	const markdownUri = fixedArguments[1];
	const data = await readUri(markdownUri);
	if (data == null)
	{
		console.error("Unable to read from " + markdownUri + "!");
		process.exit(1);
		return;
	}

	const document = Document.fromString(data);

	const action = fixedArguments[0];
	switch (action)
	{
		case "update":
			for (const table of getModTables(document))
			{
				await updateMods(new ModTable(table));
			}
			break;
		case "add-version":
		{
			const version = fixedArguments[2];
			for (const table of getModTables(document))
			{
				const modTable = new ModTable(table);
				modTable.addVersion(version);
			}
			break;
		}
		case "remove-version":
		{
			const version = fixedArguments[2];
			for (const table of getModTables(document))
			{
				const modTable = new ModTable(table);
				modTable.removeVersion(version);
			}
			break;
		}
		case "sort":
		{
			// TODO: add optional parameter to select what column to sort by / invert sort
			for (const table of getModTables(document))
			{
				const modTable = new ModTable(table);
				modTable.sortColumn(0);
			}
			break;
		}
		case "clean":
		{
			/* TODO:
			remove/warn on duplicate mods
			find the latest version (in the md) of a mod and replace all hyperlinks $latest
			this will make sure all mod/dep rows use the same version

			for (const table of getModTables(document))
			{
				const modtable = new ModTable(table);
			}*/
			break;
		}
		case "import-manifest":
		{
			// convert a twitch/curseforge formatted manifest.json into markdown table rows
			const manifestUri = fixedArguments[2];
			const data = await readUri(manifestUri);
			if (data == null)
			{
				console.error("Unable to read from " + manifestUri + "!");
				process.exit(1);
				return;
			}
			const manifestJson = JSON.parse(data);
			const mcVersion = manifestJson.minecraft.version;
			const modTable = new ModTable(getModTables(document)[0]);
			if (!modTable.containsVersion(mcVersion))
			{
				console.error(`Minecraft version ${mcVersion} missing from ${markdownUri}!`);
				process.exit(1);
				return;
			}

			const mods = await parseManifest(manifestJson);
			const mdVersions = modTable.getVersions();
			const column = mdVersions.indexOf(mcVersion);
			const modtableRows = modTable.getTable().rows;
			modtableRows.splice(0, modtableRows.length); // empty the 'template' table

			mods.forEach((modInfo, modName) =>
			{
				let modRow = "";
				mdVersions.forEach((v, i) => modRow += (i == column) ? `|[${mcVersion}](${modInfo.fileUrl})` : "| - ");
				modtableRows.push(new TableRow(`| ${modName} | ✔ ${modRow}|`));

				modInfo.dependencies.forEach((depLink, depName) =>
				{
					let depRow = "";
					mdVersions.forEach((v, i) => depRow += (i == column) ? `|[${mcVersion}](${depLink})` : "| - ");
					modtableRows.push(new TableRow(`| + ${depName} | ✔ ${depRow}|`));
				});
			});

			console.log(modTable.getTable().toString());
			break;
		}
	}

	let markdown = document.toString();
	if (markdown.endsWith("\n"))
	{
		// Strip trailing line break because console.log will re-add it
		markdown = markdown.substring(0, markdown.length - 1);
	}

	if (action != "import-manifest") console.log(markdown);
}

main(process.argv.length, process.argv);
