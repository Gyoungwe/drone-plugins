import { readdir } from "node:fs/promises";
import type { KnowledgeBinding } from "./config.js";
import { readKnowledgeBinding, withKnowledgeBinding } from "./config.js";
import { readNoteFile, type ReadNoteResult } from "./files.js";
import { containedVaultFile, replaceVaultFile } from "./layout.js";
import { looksLikeFileName } from "./note-title.js";
import { notifyKnowledgeChange } from "./service.js";
import { invalidateKnowledgeUi } from "./ui-state.js";

export interface MaintenanceTopicInput {
	notePath: string;
	topic: string;
	revision: number;
}

function topicText(
	original: string,
	topic: string,
	sourceHeading: string,
): string {
	const line = `topic: ${JSON.stringify(topic)}`;
	let text: string;
	if (original.startsWith("---\n")) {
		const end = original.indexOf("\n---", 4);
		if (end < 0) throw new Error("Invalid note frontmatter");
		const frontmatter = original.slice(4, end);
		const next = /^topic:.*$/mu.test(frontmatter)
			? frontmatter.replace(/^topic:.*$/mu, line)
			: `${frontmatter}\n${line}`;
		text = `---\n${next}${original.slice(end)}`;
	} else text = `---\n${line}\n---\n\n${original}`;
	return text.replace(/^#\s+(.+)$/mu, (heading, title: string) =>
		title.trim() === sourceHeading || looksLikeFileName(title)
			? `# ${topic}`
			: heading,
	);
}

async function projectMirrors(
	binding: KnowledgeBinding,
	tail: string,
): Promise<ReadNoteResult[]> {
	const directory = await containedVaultFile(binding.vault, "Projects");
	let projects;
	try {
		projects = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		// A shared-only Vault has no project mirrors to update.
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const mirrors: ReadNoteResult[] = [];
	for (const project of projects) {
		if (
			!project.isDirectory() ||
			!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(project.name)
		)
			continue;
		try {
			mirrors.push(
				await readNoteFile(binding.vault, `Projects/${project.name}/${tail}`),
			);
		} catch (error) {
			// Most projects do not mirror every shared source; other read failures must remain visible.
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return mirrors;
}

/** Update a source topic and its project mirrors through the installed package. */
export async function knowledgeMaintenanceTopic({
	notePath,
	topic,
	revision,
}: MaintenanceTopicInput) {
	const binding = await readKnowledgeBinding({ fresh: true });
	if (!binding) throw new Error("No application knowledge Vault is bound");
	if (
		!Number.isSafeInteger(revision) ||
		revision < 1 ||
		binding.revision !== revision
	)
		throw new Error(
			"Knowledge binding changed; refresh maintenance before writing",
		);
	const value = topic
		.replace(/[<>\r\n]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, 120);
	if (value.length < 4)
		throw new Error("topic must describe the source in a short phrase");
	const path = notePath.replaceAll("\\", "/").replace(/^\/+/, "");
	if (!/^Library\/(?:Papers|Software)\/[^/]+\.md$/u.test(path))
		throw new Error(
			"note_path must be a Library/Papers or Library/Software note",
		);
	return withKnowledgeBinding(binding, async () => {
		const source = await readNoteFile(binding.vault, path);
		const heading = source.text.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? "";
		const notes = [
			source,
			...(await projectMirrors(binding, path.slice("Library/".length))),
		];
		const changes = notes.map((note) => ({
			note,
			text: topicText(note.text, value, heading),
		}));
		const updated: string[] = [];
		for (const { note, text } of changes) {
			if (text === note.text) continue;
			await withKnowledgeBinding(binding, async () => {
				const target = await containedVaultFile(binding.vault, note.path);
				await replaceVaultFile(target, text, { expectedHash: note.hash });
				if ((await readNoteFile(binding.vault, note.path)).text !== text)
					throw new Error(`Topic write could not be read back: ${note.path}`);
			});
			updated.push(note.path);
			await notifyKnowledgeChange(
				await containedVaultFile(binding.vault, note.path),
			);
		}
		if (updated.length) invalidateKnowledgeUi();
		return {
			topic: value,
			note: path,
			changed: changes[0]!.text !== source.text,
			updated,
		};
	});
}
