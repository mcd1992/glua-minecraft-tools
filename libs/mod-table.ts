import { Document, ITable, ITableRow, TableCell, TableRow } from "./markdown";
import { IModRepository } from "./imodrepository";
import { ModRepositories } from "./modrepositories";

const modRepositories = new ModRepositories();

export function isModTable(table: ITable): boolean
{
	const text = table.header.cells[0].text;
	return text != null ? text.trim().toLowerCase() == "mod name" : false;
}

export function getModTables(document: Document): ITable[]
{
	return document.getTables().filter(isModTable);
}

export class ModTable
{
	private table: ITable;
	private versions: { [_: string]: number } = {};

	public constructor(table: ITable)
	{
		this.table = table;

		const header = table.header;
		for (let x = 2; x < header.cells.length; x++)
		{
			this.versions[header.cells[x].text.trim()] = x;
		}
	}

	public addVersion(version: string)
	{
		if (version in this.versions) { return; }

		this.versions[version] = this.table.header.cells.length;
		this.table.addColumn(" " + version + " ", " - ");
	}

	public containsVersion(version: string): boolean
	{
		return version in this.versions;
	}

	public getTable(): ITable
	{
		return this.table;
	}

	public getVersions(): string[]
	{
		return Object.keys(this.versions);
	}

	public getModCount(): number
	{
		return this.table.rows.length;
	}

	public getModName(index: number): string|null
	{
		const row = this.table.rows[index];
		if (row == null) { return null; }

		let name = row.cells[0].text.trim();
		while (name.startsWith("+ ")) // Recursively strip 'dependency' marker
		{
			name = name.substring(2);
		}

		return name;
	}

	public getModId(index: number): [IModRepository, string]|null
	{
		const row = this.table.rows[index];
		if (row == null) { return null; }

		for (let x = 0; x < row.cells.length; x++)
		{
			const match = row.cells[x].text.match(/\[[^\]]+\]\(([^)]+)\)/); // Extract URL out of markdown hyperlink
			if (match == null) { continue; }

			const url = match[1];

			const result = modRepositories.parseModUrl(url);
			if (result != null && result[0].name != "url")
			{
				return result;
			}
		}

		return [modRepositories.get("url")!, this.getModName(index)!];
	}

	public getModReleaseId(index: number, version: string): [IModRepository, string, string]|null
	{
		const url = this.getModReleaseUrl(index, version);
		if (url == null) { return null; }

		return modRepositories.parseModReleaseUrl(url);
	}

	public getModReleaseUrl(index: number, version: string): string|null
	{
		const column = this.versions[version];
		if (column == null) { return null; }

		const row = this.table.rows[index];
		if (row == null) { return null; }

		const cell = row.cells[column];
		if (cell == null) { return null; }

		const match = cell.text.match(/\[[^\]]+\]\(([^)]+)\)/);
		return match ? match[1] : null;
	}

	public isModEnabled(index: number): boolean
	{
		const row = this.table.rows[index];
		if (row == null) { return false; }

		return row.cells[1].text.indexOf("✔") != -1;
	}

	public removeVersion(version: string)
	{
		if (!(version in this.versions)) { return; }

		const index = this.versions[version];
		this.table.removeColumn(index);

		delete this.versions[version];
		for (const version in this.versions)
		{
			if (this.versions[version] > index)
			{
				this.versions[version]--;
			}
		}
	}

	public setModReleaseId(index: number, version: string, modRepository: IModRepository, id: string, releaseId: string): boolean
	{
		const url = modRepository.getModReleaseUrl(id, releaseId);
		return this.setModReleaseUrl(index, version, url);
	}

	public setModReleaseUrl(index: number, version: string, url: string | null): boolean
	{
		const row = this.table.rows[index];
		if (row == null) { return false; }

		const column = this.versions[version];
		if (column == null) { return false; }

		const text = url == null ? " - " : (" [" + version + "](" + url + ") ");
		while (row.cells.length <= column)
		{
			row.cells.push(new TableCell(" - "));
		}
		row.cells[column].text = text;

		return true;
	}

	public sortColumn(index: number, descend: boolean = false)
	{
		const depMap = new Map();
		const temp: ITableRow[] = [];
		let lastParent = new TableRow("");
		const seenMap = new Map();
		for (let i = 0; i < this.table.rows.length; i++)
		{
			const row = this.table.rows[i];
			const modName = row.cells[0].text.trim();

			// 'hide' dependencies from the temp array when sorting, add them back later
			if (modName.startsWith("+ "))
			{
				let offset = 0;
				const deps = new Map();

				// Loop and group all the dependencies at once
				for (; offset < this.table.rows.length; offset++)
				{
					const depRow = this.table.rows[i + offset];
					if (!depRow) break;

					const depMatch = depRow.cells[0].text.trim().match(/^[ \+]+(.*)$/);
					if (depMatch && depMatch.length > 1)
					{
						deps.set(depRow.cells[0].text, depRow);
					}
					else
					{
						break;
					}
				}
				depMap.set(lastParent.cells[0].text, deps);
				i += (offset - 1);
			}
			else
			{ // Store the dependency and its parent for later
				if (!seenMap.has(modName))
				{ // lazy unique filter
					seenMap.set(modName, true);
					temp.push(row);
				}
				lastParent = row;
			}
		}

		temp.sort((a, b) =>
		{
			if (a.cells[index].text < b.cells[index].text) return descend ? 1 : -1;
			if (a.cells[index].text > b.cells[index].text) return descend ? -1 : 1;

			if (index != 0) // Secondary sort by mod/dep name
			{
				if (a.cells[0].text < b.cells[0].text) return descend ? 1 : -1;
				if (a.cells[0].text > b.cells[0].text) return descend ? -1 : 1;
			}
			return 0;
		});

		// Re-insert the dependencies after the sorting is complete
		depMap.forEach((deps, parentName) =>
		{
			temp.forEach((row, i) =>
			{
				if (row.cells[0].text === parentName)
				{
					deps.forEach((depRow) =>
					{
						temp.splice(i + 1, 0, depRow);
					});
				}
			});
		});

		this.table.rows.splice(0, this.table.rows.length); // empty the rows array
		for (const row of temp)
		{
			this.table.rows.push(row);
		}
	}
}
