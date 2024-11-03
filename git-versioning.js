/* Start from term 
set WATCH_DIRS=D:\coding\24\vue\moms-journal,D:\coding\24\vue\moms-journal
set WATCH_DIRS=D:\coding\24\vue\moms-journal,D:\coding\24\vue\server-moms */

const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ignore = require('ignore');

// Read directory paths from the WATCH_DIRS environment variable
const dirPaths = process.env.WATCH_DIRS; // e.g., "D:\coding\24\stocks\ticker,D:\coding\24\stocks\open"
const WATCH_DIRS = process.env.WATCH_DIRS.split(',').map(dir => path.resolve(dir + '/**/*')); // Include all subdirectories


let isProcessing = false; // Flag to prevent multiple git commands

// Function to log messages
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};

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

    log(`Loaded ignore patterns from .ignore: ${ignorePatterns.join(', ')}`);
    return ignorePatterns;
};

// Function to commit and push changes
const commitAndPush = (projectDir) => {
    if (isProcessing) {
        log('Commit process is already in progress, skipping this event.');
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
    try {
        const relativePath = path.relative(projectDir, filePath); // Get relative path

        // If the relative path is empty or irregular, return false (do not ignore)
        if (!relativePath || relativePath.startsWith('..')) {
            log(`Invalid path for ignore check: ${filePath}`);
            return false;
        }

        const ig = ignore().add(ignorePatterns); // Use ignore patterns
        const ignored = ig.ignores(relativePath); // Determine if the file should be ignored
        if (ignored) {
            log(`Ignoring: ${relativePath}`); // Log ignored file
        }
        return ignored; // Return whether to ignore
    } catch (error) {
        log(`Error checking if file should be ignored: ${error.message}`);
        return false; // Default to not ignoring on error
    }
};


WATCH_DIRS.forEach((projectDir) => {
    log(`Watching for changes in ${projectDir}...`);

    const watcher = chokidar.watch(projectDir, {
        persistent: true,
        ignored: /node_modules|\.git|\.ignore/, // Ignore certain directories
        ignoreInitial: true, // Ignore initial file load events
        depth: Infinity // Watch all nested directories
    });

    watcher.on('all', (event, filePath) => {
        console.log(`Detected ${event} on ${filePath}`);
        const relativePath = path.relative(projectDir, filePath);
        log(`File ${relativePath} has been changed. Event: ${event}`);
    
        // Only commit and push on relevant events
        if (event === 'add' || event === 'change' || event === 'unlink') {
            commitAndPush(projectDir);
        }
    });
});
