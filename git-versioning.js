/* To run this app from the command line:
set WATCH_DIRS=D:\coding\24\vue\moms-journal,D:\coding\24\vue\server-moms
node D:\coding\24\vue\git-versioning.js */

const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ignore = require('ignore');

// Read directory paths from the WATCH_DIRS environment variable
const dirPaths = process.env.WATCH_DIRS; // e.g., "D:\coding\24\stocks\ticker,D:\coding\24\stocks\open"
const WATCH_DIRS = dirPaths.split(',').map(dir => path.resolve(dir)); // Convert to absolute paths

let isProcessing = false; // Flag to prevent multiple git commands
const verbose = process.argv.includes("-v"); // Check for verbose mode

// Function to log messages
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};
if(verbose) {
    const verboseLog = (msg) => {
        console.log(`[VERBOSE] ${msg}`)
    }
} else {
    // Define a no-op function to avoid errors if verbose mode is not enabled
    verboseLog = () => {}
}

// Function to load ignore patterns from the .ignore file
const loadIgnoreFile = () => {
    const ignoreFilePath = path.join(__dirname, '.ignore');

    if (!fs.existsSync(ignoreFilePath)) {
        log(`.ignore file not found. Exiting...`);
        process.exit(1);
    }

    const ignorePatterns = fs.readFileSync(ignoreFilePath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')); // Remove comments and empty lines

    log(`Loaded ignore patterns from .ignore`);
    verboseLog(`Loaded ignore patterns from .ignore: ${ignorePatterns.join(', ')}`);
    return ignorePatterns;
};

// Function to commit and push changes
const commitAndPush = (projectDir) => {
    if (isProcessing) {
        verboseLog('Commit process is already in progress, skipping this event.');
        return;
    }

    isProcessing = true; // Set flag to indicate processing

    exec('git status --porcelain', { cwd: projectDir }, (error, stdout) => {
        if (error) {
            log(`Error checking git status: ${error.message}`);
            isProcessing = false; // Reset flag on error
            return;
        }

        // If stdout is empty, there are no changes to commit
        if (!stdout.trim()) {
            log('No changes to commit.');
            isProcessing = false; // Reset flag if no changes
            return; // Exit early if no changes
        }

        log(`Detected changes:\n${stdout}`); // Log detected changes

        // Stage changes
        exec('git add .', { cwd: projectDir }, (addError) => {
            if (addError) {
                log(`Failed to stage changes: ${addError.message}`);
                isProcessing = false; // Reset flag on error
                return;
            }

            // Create a sanitized commit message with the current date and time
            const commitMessage = `Update at ${new Date().toISOString()}`;
            log(`Preparing to commit with message: ${commitMessage}`); // Log commit message

            exec(`git commit -m "${commitMessage}"`, { cwd: projectDir }, (commitError) => {
                if (commitError) {
                    log(`Commit failed: ${commitError.message}`);
                    isProcessing = false; // Reset flag on error
                    return;
                }
                log(`Committed: ${commitMessage}`);
                exec('git push', { cwd: projectDir }, (pushError) => {
                    isProcessing = false; // Reset flag after push
                    if (pushError) {
                        log(`Push failed: ${pushError.message}`);
                        return;
                    }
                    log('Changes pushed successfully.');
                });
            });
        });
    });
};

// Check if WATCH_DIRS is empty
if (WATCH_DIRS.length === 0) {
    log('No directories provided to watch. Please provide full directory paths in the WATCH_DIRS environment variable.');
    process.exit(1); // Exit if no directories are provided
}

// Load ignore patterns
const ignorePatterns = loadIgnoreFile();

// Function to check if a file should be ignored
const shouldIgnoreFile = (projectDir, filePath) => {
    const relativePath = path.relative(projectDir, filePath); // Get relative path

    // If the relative path is empty, return false (indicates the directory itself)
    if (!relativePath) {
        verboseLog(`Not checking ignore patterns for directory: ${filePath}`);
        return false; // Do not ignore directories themselves
    }

    const ig = ignore().add(ignorePatterns); // Use ignore patterns
    const ignored = ig.ignores(relativePath); // Determine if the file should be ignored
    if (ignored) {
        verboseLog(`Ignoring: ${relativePath}`); // Log ignored file
    }
    return ignored; // Return whether to ignore
};

WATCH_DIRS.forEach((projectDir) => {
    log(`Watching for changes in ${projectDir}...`);

    const watcher = chokidar.watch(projectDir, {
        persistent: true,
        ignored: (filePath) => {
            return shouldIgnoreFile(projectDir, filePath); // Pass projectDir to shouldIgnoreFile
        }
    });

    watcher.on('all', (event, filePath) => {
        const relativePath = path.relative(projectDir, filePath);
        verboseLog(`File ${relativePath} has been changed. Event: ${event}`);

        // Only commit and push on relevant events
        if (event === 'add' || event === 'change' || event === 'unlink') {
            commitAndPush(projectDir);
        }
    });
});
