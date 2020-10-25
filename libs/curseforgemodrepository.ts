import * as request from "request-promise";

import { IModRepository } from "./imodrepository";

const slugReplacements = new Map<string, string>();
slugReplacements.set("cofhcore", "cofh-core");
slugReplacements.set("eleccore-rendering-library", "eleccore");
slugReplacements.set("just-enough-items-jei", "jei");
slugReplacements.set("orbis-api", "orbis-lib");
slugReplacements.set("thermalexpansion", "thermal-expansion");

export class CurseforgeModRepository implements IModRepository
{
	public readonly name = "curseforge";

	private minecraftGameId: Promise<string>|null = null;
	private slugIds = new Map<string, string|null>();
	private slugReplacements = new Map<string, string>(slugReplacements);
	private latestModReleaseIds = new Map<string, Map<string, string>>();

	public constructor()
	{
	}

	// IModRepository
	public async getMinecraftVersions(): Promise<string[]>
	{
		const json = await this.get("/minecraft/version");
		return json.map(x => x.versionString).reverse();
	}

	public getModUrl(slug: string): string
	{
		slug = this.translateSlug(slug);

		return `https://www.curseforge.com/minecraft/mc-mods/${slug}`;
	}

	public parseModUrl(url: string): string|null
	{
		let match = url.match(/https?:\/\/minecraft\.curseforge\.com\/projects\/([^/]+)/);
		if (match != null) { return match[1]; }

		match = url.match(/https?:\/\/(?:www\.)?curseforge\.com\/minecraft\/mc-mods\/([^/]+)/);
		if (match != null) { return match[1]; }

		return null;
	}

	public async getLatestModReleaseId(slug: string, minecraftVersion: string): Promise<string|null>
	{
		slug = this.translateSlug(slug);

		const id = await this.getSlugId(slug);
		if (id == null) { return null; }

		if (!this.latestModReleaseIds.has(slug))
		{
			const json = await this.get(`/addon/${id}/files`);

			const latestDates = new Map<string, string>();
			const latestReleaseIds = new Map<string, string>();
			for (const result of json)
			{
				for (const version of result.gameVersion)
				{
					if (!latestDates.has(version) ||
					    result.fileDate > latestDates.get(version)!)
					{
						latestDates.set(version, result.fileDate);
						latestReleaseIds.set(version, result.id.toString());
					}
				}
			}

			this.latestModReleaseIds.set(slug, latestReleaseIds);
		}

		const latestReleaseIds = this.latestModReleaseIds.get(slug)!;
		return latestReleaseIds.has(minecraftVersion) ? latestReleaseIds.get(minecraftVersion)! : null;
	}

	public getModReleaseUrl(slug: string, releaseId: string): string
	{
		slug = this.translateSlug(slug);

		return `https://www.curseforge.com/minecraft/mc-mods/${slug}/files/${releaseId}`;
	}

	public async getModReleaseDownloadUrl(slug: string, releaseId: string): Promise<string|null>
	{
		// https://www.curseforge.com/minecraft/mc-mods/${slug}/download/${releaseId}/file
		// is blocked by Cloudflare
		slug = this.translateSlug(slug);

		const id = await this.getSlugId(slug);
		if (id == null) { return null; }

		const json = await this.get(`/addon/${id}/file/${releaseId}`);
		return json.downloadUrl;
	}

	public async getModInfo(projectId: string): Promise<any>
	{
		const json = await this.get(`/addon/${projectId}`);
		return json;
	}

	public async getFileInfo(projectId: string, fileId: string): Promise<any>
	{
		const json = await this.get(`/addon/${projectId}/file/${fileId}`);
		return json;
	}

	public parseModReleaseUrl(url: string): [string, string]|null
	{
		let match = url.match(/https?:\/\/minecraft\.curseforge\.com\/projects\/([^/]+)\/files\/(\d+)/);
		if (match != null) { return [match[1], match[2]]; }

		match = url.match(/https?:\/\/(?:www\.)?curseforge\.com\/minecraft\/mc-mods\/([^/]+)\/files\/(\d+)/);
		if (match != null) { return [match[1], match[2]]; }

		return null;
	}

	// CurseforgeModRepository
	private async get(url: string): Promise<any>
	{
		url = `https://addons-ecs.forgesvc.net/api/v2${url}`;
		if (process.env.DEBUG_CURSEFORGE)
		{
			console.error(`GET ${url}`);
		}
		return JSON.parse(await request.get(url));
	}

	public async getMinecraftGameId(): Promise<string>
	{
		if (this.minecraftGameId == null)
		{
			this.minecraftGameId = (async () =>
			{
				const json = await this.get("/game");
				return json.find(x => x.slug == "minecraft").id.toString();
			})();
		}

		return this.minecraftGameId;
	}

	public async getSlugId(slug: string): Promise<string|null>
	{
		slug = this.translateSlug(slug);

		if (!this.slugIds.has(slug))
		{
			const url = `https://api.cfwidget.com/minecraft/mc-mods/${slug}`;
			if (process.env.DEBUG_CURSEFORGE)
			{
				console.error(`GET ${url}`);
			}
			let json: string|null = null;
			try { json = await request.get(url); }
			catch {}

			if (json != null)
			{
				const id = JSON.parse(json).id.toString();
				this.slugIds.set(slug, id);

				const newSlug = (await this.get(`/addon/${id}`)).slug;
				if (slug != newSlug)
				{
					this.slugReplacements.set(slug, newSlug);
					console.error(`!!! Slug ${slug} has been renamed to ${newSlug}!`);
				}
			}
			else
			{
				// Fallback to addon search, which is less reliable
				// (Is this better? https://servermods.forgesvc.net/servermods/projects?search=modslug)
				const json = await this.get(`/addon/search?gameId=${await this.getMinecraftGameId()}&searchFilter=${encodeURIComponent(slug)}`);
				for (const result of json)
				{
					this.slugIds.set(result.slug, result.id.toString());
				}
			}

			if (!this.slugIds.has(slug))
			{
				console.error(`!!! Could not find mod ID for slug ${slug}!`);
			}
		}

		return this.slugIds.has(slug) ? this.slugIds.get(slug)! : null;
	}

	public translateSlug(slug: string): string
	{
		return this.slugReplacements.has(slug) ? this.slugReplacements.get(slug)! : slug;
	}
}
