const MAX_INITIALS = 2;
const HUE_CIRCLE_DEGREES = 360;
// A multiplier for the string hash (the classic djb2 shape); any odd
// constant spreads nearby addresses across the hue circle.
const HASH_MULTIPLIER = 31;

// "Dev Admin" → "DA", "ops" → "OP"; falls back to the email's local part
// when the name is blank, since an account always has an email.
export function toInitials(name: string, email: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);

	if (words.length >= MAX_INITIALS) {
		return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
	}

	const source = words[0] ?? email.split('@')[0];

	return source.slice(0, MAX_INITIALS).toUpperCase();
}

// A stable hue per account, so the same operator always gets the same
// avatar color on every device without storing anything.
export function toAvatarHue(email: string): number {
	let hash = 0;

	for (const character of email.toLowerCase()) {
		hash = (hash * HASH_MULTIPLIER + character.charCodeAt(0)) % HUE_CIRCLE_DEGREES;
	}

	return hash;
}
