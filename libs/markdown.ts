export type IElement = ITable | ISection | ILines;

export interface ITable
{
	readonly type: "table";

	readonly rows: ITableRow[];

	readonly header: ITableRow;

	addColumn(headerText: string, fillText?: string|null, width?: number|null);
	insertColumn(index: number, headerText: string, fillText?: string|null, width?: number|null);
	removeColumn(index: number);

	formatWidths();
}

export interface ITableCell
{
	text: string;
	width: number;
}

export interface ITableRow
{
	readonly cells: ITableCell[];
}

export interface IElementCollection
{
	readonly elements: IElement[];
}

export interface ISection extends IElementCollection
{
	readonly type: "section";

	title: string;
	level: number;
}

export interface ILines
{
	readonly type: "lines";

	readonly lines: string[];
}

export interface IDocument extends IElementCollection
{
}

export class TableCell implements ITableCell
{
	private _text: string;
	public width: number;

	public constructor(text: string, width: number|null = null)
	{
		width = width != null ? width : text.length;

		this.text = text;
		this.width = Math.max(width, this.text.length);
	}

	// ITableCell
	public get text()
	{
		return this._text;
	}

	public set text(value: string)
	{
		this._text = value;
		this.width = Math.max(this.width, this._text.length);
	}
}

export class TableRow implements ITableRow
{
	public cells: ITableCell[];

	public constructor(line: string)
	{
		if (!line.trim().endsWith("|"))
		{
			line += "|";
		}

		const cells = line.split("|");
		cells.shift();
		cells.pop();
		this.cells = cells.map(x => new TableCell(x));
	}

	public toString()
	{
		let row = "|";
		for (let i = 0; i < this.cells.length; i++)
		{
			row += this.cells[i].text + " ".repeat(Math.max(0, this.cells[i].width - this.cells[i].text.length)) + "|";
		}
		return row;
	}
}

export class Table implements ITable
{
	public readonly type = "table";

	public readonly header: ITableRow;
	public rows: ITableRow[] = [];

	public constructor(header: ITableRow)
	{
		this.header = header;
	}

	public toString(): string
	{
		const header = this.header.toString();
		let separator = "|";
		for (const cell of this.header.cells)
		{
			separator += " " + "-".repeat(cell.width - 2) + " |";
		}
		return header + "\n" + separator + "\n" + this.rows.map(x => x.toString()).join("\n");
	}

	// ITable
	public addColumn(headerText: string, fillText: string|null = null, width: number|null = null)
	{
		this.insertColumn(this.header.cells.length, headerText, fillText, width);
	}

	public insertColumn(index: number, headerText: string, fillText: string|null = null, width: number|null = null)
	{
		fillText = fillText || "";
		width = width != null ? width : Math.max(headerText.length, fillText.length);

		this.header.cells.splice(index, 0, new TableCell(headerText, width));
		for (const row of this.rows)
		{
			row.cells.splice(index, 0, new TableCell(fillText, width));
		}
	}

	public removeColumn(index: number)
	{
		this.header.cells.splice(index, 1);
		for (const row of this.rows)
		{
			row.cells.splice(index, 1);
		}
	}

	public formatWidths()
	{
		const widths: number[] = [];
		for (let y = 0; y < this.rows.length; y++)
		{
			const row = this.rows[y];

			while (widths.length < row.cells.length)
			{
				widths.push(0);
			}

			for (let x = 0; x < row.cells.length; x++)
			{
				widths[x] = Math.max(widths[x], Math.max(row.cells[x].text.length, row.cells[x].width));
			}
		}

		for (let y = 0; y < this.rows.length; y++)
		{
			const row = this.rows[y];
			for (let x = 0; x < row.cells.length; x++)
			{
				row.cells[x].width = widths[x];
			}
		}
	}
}

export class Section implements ISection
{
	public readonly type = "section";

	public title: string;
	public level: number;

	public readonly elements: IElement[] = [];

	public constructor(title: string, level: number)
	{
		this.title = title;
		this.level = level;
	}

	public toString(): string
	{
		const title = "#".repeat(this.level) + " " + this.title;
		if (this.elements.length == 0) { return title; }

		return title + "\n" + this.elements.map(x => x.toString()).join("\n");
	}
}

export class Lines implements ILines
{
	public readonly type = "lines";

	public readonly lines: string[] = [];

	public constructor()
	{
	}

	public toString(): string
	{
		return this.lines.join("\n");
	}
}

export class Document implements IDocument
{
	public readonly elements: IElement[] = [];

	public constructor(document: string)
	{
		const lines = document.split("\n");

		let i = 0;
		const sectionStack: ISection[] = [];
		let elementCollection: IElementCollection = this;
		let linesElement: Lines|null = null;
		while (i < lines.length)
		{
			if (lines[i].startsWith("#"))
			{
				linesElement = null;

				let level = 0;
				while (lines[i][level] == "#")
				{
					level++;
				}

				const title = lines[i].substring(level).trim();
				const section = new Section(title, level);

				while (sectionStack.length > 0 &&
				       sectionStack[sectionStack.length - 1].level >= section.level)
				{
					sectionStack.pop();
				}
				elementCollection = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : this;
				sectionStack.push(section);
				elementCollection.elements.push(section);
				elementCollection = section;
				i++;
			}
			else if (lines[i].indexOf("|") != -1)
			{
				linesElement = null;

				const header = new TableRow(lines[i]);
				i++;
				i++;
				const table = new Table(header);
				elementCollection.elements.push(table);
				while (i < lines.length &&
				       lines[i].indexOf("|") != -1)
				{
					table.rows.push(new TableRow(lines[i]));
					i++;
				}
			}
			else
			{
				if (linesElement == null)
				{
					linesElement = new Lines();
					elementCollection.elements.push(linesElement);
				}

				linesElement.lines.push(lines[i]);
				i++;
			}
		}
	}

	public toString(): string
	{
		return this.elements.map(x => x.toString()).join("\n");
	}

	// Document
	public getTables(): ITable[]
	{
		const tables: ITable[] = [];

		const queue: IElementCollection[] = [];
		queue.push(this);

		let elementCollection: IElementCollection|undefined;
		// eslint-disable-next-line no-cond-assign
		while (elementCollection = queue.pop())
		{
			for (const element of elementCollection.elements)
			{
				if (element instanceof Section)
				{
					queue.push(element);
				}
				else if (element instanceof Table)
				{
					tables.push(element as ITable);
				}
			}
		}

		return tables;
	}

	public static fromString(string: string): Document
	{
		return new Document(string);
	}
}
