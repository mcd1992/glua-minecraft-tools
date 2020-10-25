import { IModRepository } from "./imodrepository";
import { CurseforgeModRepository } from "./curseforgemodrepository";
import { UrlModRepository } from "./urlmodrepository";

export class ModRepositories
{
	private readonly modRepositories: IModRepository[] = [];
	private readonly modRepositoriesByName = new Map<string, IModRepository>();

	public constructor()
	{
		this.add(new CurseforgeModRepository());
		this.add(new UrlModRepository());
	}

	public add(modRepository: IModRepository)
	{
		this.modRepositories.push(modRepository);
		this.modRepositoriesByName.set(modRepository.name, modRepository);
	}

	public get(name: string): IModRepository|null
	{
		return this.modRepositoriesByName.get(name)!;
	}

	/**
	 *
	 * @param url Takes the full curseforge URL to parse the mod slug out of
	 * @returns a new IModRepository instance and a string containing the mod slug; or null on error
	 */
	public parseModUrl(url: string): [IModRepository, string]|null
	{
		for (const modRepository of this.modRepositories)
		{
			const id = modRepository.parseModUrl(url);
			if (id == null) { continue; }

			return [modRepository, id];
		}

		return null;
	}

	public parseModReleaseUrl(url: string): [IModRepository, string, string]|null
	{
		for (const modRepository of this.modRepositories)
		{
			const result = modRepository.parseModReleaseUrl(url);
			if (result == null) { continue; }

			return [modRepository, result[0], result[1]];
		}

		return null;
	}
}
