// Wrapper class to enable accessing the output of a subprocess
class ProcessOutputBuffer {
  constructor(process) {
    this.process = process;
    this.outputLines = [];
    this.stdoutLines = [];
    this.stderrLines = [];
    process.onStdout(this.onStdout.bind(this));
    process.onStderr(this.onStderr.bind(this));
  }

  onStdout(line) {
    this.outputLines.push(line);
    this.stdoutLines.push(line);
  }

  onStderr(line) {
    this.outputLines.push(line);
    this.stderrLines.push(line);
  }

  get output() {
    return this.outputLines.join('\n');
  }

  get stdout() {
    return this.stdoutLines.join('\n');
  }

  get stderr() {
    return this.stderrLines.join('\n');
  }
}

// Wrapped up process executor, returns a Promise<ProcessOutputBuffer>
const exec = (cmdline) => new Promise(
  (resolve, reject) => {
    const process = new Process(
      "/usr/bin/env",
      {
        args: cmdline,
        cwd: nova.workspace.path
      }
    );

    const buffer = new ProcessOutputBuffer(process);

    process.onDidExit((status) => {
      (status === 0 ? resolve : reject)(buffer)
    });

    process.start();
  }
);

// Nova doesn't include the URL API,
// so we have to do manual string searches
const PROTOCOL_END_NEEDLE = '://';
const USERNAME_END_NEEDLE = "git@";

// Function which retrieves a Git web permalink for common SCM services
const getGitRefToLink = async (path) => {

  const gitCheck = await exec(["git", "rev-parse"]).catch((failure) => Promise.reject(`The file '${path}' is not in a git repository.`));

  const headSHAOutput = await exec(["git", "rev-parse", "HEAD"]).catch((failure) => failure.stderr.trim());
  const headSHA = headSHAOutput.stdout.trim();
  console.log(`Head SHA: ${headSHA}`);
  // const branchName = await exec(["git", "symbolic-ref", "--quiet", "--short", "HEAD"]);

  const upstreamBranch = await exec(["git", "rev-parse", "--abbrev-ref", "HEAD@{upstream}"]).catch((failure) => failure.stderr.trim());
  console.log(`Upstream Branch: ${upstreamBranch.stdout}`);

  const upstreamName = upstreamBranch.stdout.split("/").shift();
  console.log(`Upstream Name: ${upstreamName}`);

  const remoteURL = await exec(["git", "remote", "get-url", upstreamName]).catch((failure) => failure.stderr.trim());
  let remoteURLString = remoteURL.stdout;
  console.log(`Remote URL: ${remoteURLString}`);

  const protocolEndIndex = remoteURLString.indexOf(PROTOCOL_END_NEEDLE);
  const userEndIndex = remoteURLString.indexOf(USERNAME_END_NEEDLE);
  const repoEndIndex = remoteURLString.lastIndexOf('.git');

  let hostStartIndex = 0;
  if (protocolEndIndex >= 0) {
    hostStartIndex = protocolEndIndex + PROTOCOL_END_NEEDLE.length;
  } else if (userEndIndex >= 0) {
    hostStartIndex = userEndIndex + USERNAME_END_NEEDLE.length;
  } else {
    return;
  }

  const hostColonSeparatorIndex = remoteURLString.indexOf(':', hostStartIndex);
  const hostSlashSeparatorIndex = remoteURLString.indexOf('/', hostStartIndex);

  let hostSeparatorIndex;
  if (hostColonSeparatorIndex >= 0) {
    hostSeparatorIndex = hostColonSeparatorIndex;
  } else if (hostSlashSeparatorIndex >= 0) {
    hostSeparatorIndex = hostSlashSeparatorIndex;
  } else {
    return;
  }

  const hostname = remoteURLString.slice(hostStartIndex, hostSeparatorIndex)
  const repoPath = remoteURLString.slice(hostSeparatorIndex + 1, repoEndIndex)

  console.log(`Host: ${hostname}, Path: ${repoPath}`);

  const gitHubURL = `https://${hostname}/${repoPath}/blob/${headSHA}/${path}`;

  console.log(`Web URL: ${gitHubURL}`);

  return gitHubURL;
};

// Function to generate Git URLs
// returns a Promise<url>
const commandHandler = (editor, includeLines=false) => {
  if (editor.document.isRemote) {
    return Promise.reject("Document is remote; can't get Git URL");
  }

  const path = nova.workspace.relativizePath(editor.document.path);

  if (!path) {
    return Promise.reject("No path to file found; can't get Git URL");
  }

  console.log(`Path to file: ${path}`);

  const linkPromise = getGitRefToLink(path);

  console.log(`Include Lines: ${includeLines}`);

  if (includeLines) {
    return linkPromise.then((link) => {
      const linesRange = editor.getLineRangeForRange(editor.selectedRange);
      const lineCountRange = new Range(0, linesRange.start);
      const selectionLineCount = editor.getTextInRange(linesRange).match(/\n/g)?.length;
      const precedingLineCount = editor.getTextInRange(lineCountRange).match(/\n/g)?.length;
      console.log(`Lines in selection: ${selectionLineCount}, Preceding lines: ${precedingLineCount}`);

      if (precedingLineCount) {
        link += `#L${precedingLineCount + 1}`;

        if (selectionLineCount > 1) {
          link += `-L${precedingLineCount + selectionLineCount}`;
        }
      }

      return link;
    });
  }

  return linkPromise;
};

nova.commands.register(
  "github-shortcuts.showFile",
  (editor) => commandHandler(editor).then((url) => nova.openURL(url)).catch((error) => nova.workspace.showErrorMessage(error))
);

nova.commands.register(
  "github-shortcuts.copyLinkToFile",
  (editor) => commandHandler(editor).then((url) => nova.clipboard(url).writeText).catch((error) => nova.workspace.showErrorMessage(error))
);

nova.commands.register(
  "github-shortcuts.showSelection",
  (editor) => commandHandler(editor, true).then((url) => nova.openURL(url)).catch((error) => nova.workspace.showErrorMessage(error))
);

nova.commands.register(
  "github-shortcuts.copyLinkToSelection",
  (editor) => commandHandler(editor, true).then((url) => nova.clipboard.writeText(url)).catch((error) => nova.workspace.showErrorMessage(error))
);

// Do work when the extension is activated
exports.activate = () => console.log("Reloaded");

// Clean up state before the extension is deactivated
exports.deactivate = () => console.log("Unloaded");
