export function readFlag(args, name, fallback = '') {
  const long = `--${name}`;
  const withEquals = `${long}=`;
  const index = args.indexOf(long);
  if (index !== -1) return args[index + 1] ?? fallback;
  const equal = args.find((arg) => arg.startsWith(withEquals));
  if (equal) return equal.slice(withEquals.length);
  return fallback;
}

export function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

export function positional(args) {
  return args.filter((arg) => !arg.startsWith('--'));
}
