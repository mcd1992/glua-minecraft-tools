// markdown tools
// a common file containing the API to interact with the glua minecraft markdown doc

function parseRow(line: string): string[]
{
	if (!line.trim().endsWith("|"))
	{
		line += " |";
	}
	const parts = line.split("|");
	parts.shift();
	parts.pop();

	return parts.map(x => x.trim());
}

export function parseTable(lines: string[], index: number): [number, string[][], number[]]
{
	const parts = lines[index].split("|");
	parts.shift();
	parts.pop();
	const columnWidths: number[] = parts.map(x => x.length - 2);

	const rows: string[][] = [];
	rows.push(parseRow(lines[index]));
	index++;
	index++;

	while (lines[index].indexOf("|") != -1)
	{
		rows.push(parseRow(lines[index]));
		index++;
	}

	return [index, rows, columnWidths];
}

export function findModId(row: string[]): [string, string]|null
{
	for (let cell of row)
	{
		const match = cell.match(/https?:\/\/minecraft.curseforge.com\/projects\/([^\/]+)\//);
		if (match != null) { return ["curseforge", match[1]]; }
	}
	return null;
}

export function getListedVersions(table: string[][])
{
	const versions: string[] = [];
	for (let i = 2; i < table[0].length; i++)
	{
		versions.push(table[0][i]);
	}
	return versions;
}

export async function forEachMod(table: string[][],cb: (row: string[],modNamespace: string,modID: string,urls: (string|null)[]) => Promise<void> | any): Promise<string[][]>
{
	for (let i = 1; i < table.length; i++)
	{
		const row = table[i];
		const urls: (string|null)[] = [];
		for (let j = 2; j < table[i].length; j++)
		{
			const cell = table[i][j];
			if (cell == "-")
			{
				urls.push(null);
			}
			else
			{
				const match = cell.match(/\[[^\]]+\]\(([^\)]+)\)/);
				urls.push(match ? match[1] : null);
			}
		}

		const result = findModId(row);
		if (result)
		{
			const [namespace, id] = result;
			let p = cb(row,namespace,id,urls);
			if(p instanceof Promise) { await p; }
		}
		else
		{
			console.error(row[0] + ": No id found!");
		}
	}
	return table;
}

function padRight(s: string, n: number): string
{
	return s + " ".repeat(Math.max(0, n - s.length));
}

export function formatModTable(table: string[][], columnWidths: number[]): string
{
	const lines: string[] = [];
	for (let row of table)
	{
		columnWidths[0] = Math.max(columnWidths[0], row[0].length);
	}

	const dataColumnWidths: number[] = columnWidths.slice();
	for (let row of table)
	{
		for (let i = 0; i < row.length; i++)
		{
			dataColumnWidths[i] = Math.max(dataColumnWidths[i], row[i].length);
		}
	}

	for (let i = 0; i < table.length; i++)
	{
		const row = table[i];
		let line = "| " + padRight(row[0], columnWidths[0]) + " |";
		line += " " + padRight(row[1], columnWidths[1]) + " |"
		for (let j = 2; j < row.length; j++)
		{
			line += " " + padRight(row[j], i > 0 ? dataColumnWidths[j] : columnWidths[j]) + " |";
		}
		lines.push(line);
	}
	lines.splice(1, 0, "|" + columnWidths.map(x => " " + "-".repeat(x) + " ").join("|") + "|");
	return lines.join("\n");
}
