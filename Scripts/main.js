const getPath = (editor) => {
  // We can't handle remote documents right now
  if (editor.document.isRemote) {
    return null;
  }

  return nova.workspace.relativizePath(editor.document.path);
};

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

const PROTOCOL_END_NEEDLE = '://';
const USERNAME_END_NEEDLE = "git@";

const getGitRefToLink = async (path, precedingLineCount, selectionLineCount) => {
  const headSHAOutput = await exec(["git", "rev-parse", "HEAD"]);
  const headSHA = headSHAOutput.stdout.trim();
  console.log(`Head SHA: ${headSHA}`);
  // const branchName = await exec(["git", "symbolic-ref", "--quiet", "--short", "HEAD"]);

  const upstreamBranch = await exec(["git", "rev-parse", "--abbrev-ref", "HEAD@{upstream}"]);
  console.log(`Upstream Branch: ${upstreamBranch.stdout}`);

  const upstreamName = upstreamBranch.stdout.split("/").shift();
  console.log(`Upstream Name: ${upstreamName}`);

  const remoteURL = await exec(["git", "remote", "get-url", upstreamName]);
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

  let lineSuffix;

  if (precedingLineCount) {
    lineSuffix = `#L${precedingLineCount + 1}`

    if (selectionLineCount > 1) {
      lineSuffix += `-L${precedingLineCount + selectionLineCount}`;
    }
  }

  const gitHubURL = `https://${hostname}/${repoPath}/blob/${headSHA}/${path}${lineSuffix}`;

  console.log(`Web URL: ${gitHubURL}`);

  return gitHubURL;
};

nova.commands.register(
  "github-shortcuts.showFile",
  (editor) => {
    const path = getPath(editor);
    if (!path) {
      return;
    }
    console.log(`Path to file: ${path}`);
    getGitRefToLink(path).then((link) => nova.openURL(link));
  }
);

nova.commands.register(
  "github-shortcuts.copyLinkToFile",
  (editor) => {
    const path = getPath(editor);
    if (!path) {
      return;
    }
    console.log(`Path to file: ${path}`);
    getGitRefToLink(path).then((link) => nova.clipboard.writeText(link));
  }
);

nova.commands.register(
  "github-shortcuts.showSelection",
  (editor) => {
    const path = getPath(editor);
    if (!path) {
      return;
    }
    console.log(`Path to file: ${path}`);
    const linesRange = editor.getLineRangeForRange(editor.selectedRange);
    console.log(`Selection Lines: ${linesRange.start}...${linesRange.end}`);
    const lineCountRange = new Range(0, linesRange.start);
    const selectedLineCount = editor.getTextInRange(linesRange).match(/\n/g)?.length;
    const precedingLineCount = editor.getTextInRange(lineCountRange).match(/\n/g)?.length;
    console.log(`Lines in selection: ${selectedLineCount}, Preceding lines: ${precedingLineCount}`);
    getGitRefToLink(path, precedingLineCount, selectedLineCount).then((link) => nova.openURL(link));
  }
);

nova.commands.register(
  "github-shortcuts.copyLinkToSelection",
  (editor) => {
    const path = getPath(editor);
    if (!path) {
      return;
    }
    console.log(`Path to file: ${path}`);
    const linesRange = editor.getLineRangeForRange(editor.selectedRange);
    console.log(`Selection Lines: ${linesRange.start}...${linesRange.end}`);
    const lineCountRange = new Range(0, linesRange.start);
    const selectedLineCount = editor.getTextInRange(linesRange).match(/\n/g)?.length;
    const precedingLineCount = editor.getTextInRange(lineCountRange).match(/\n/g)?.length;
    console.log(`Lines in selection: ${selectedLineCount}, Preceding lines: ${precedingLineCount}`);
    getGitRefToLink(path, precedingLineCount, selectedLineCount).then((link) => nova.clipboard.writeText(link));
  }
);

// Do work when the extension is activated
exports.activate = () => console.log("Reloaded");

// Clean up state before the extension is deactivated
exports.deactivate = () => console.log("Unloaded");
