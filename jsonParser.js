#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');

const MAX_DEPTH = 38;

function lexer(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const char = input[i];
        if (char === '{') {
            tokens.push({ type: 'LBRACE', value: char });
            i++;
        } else if (char === '}') {
            tokens.push({ type: 'RBRACE', value: char });
            i++;
        } else if (char === '[') {
            tokens.push({ type: 'LBRACKET', value: char });
            i++;
        } else if (char === ']') {
            tokens.push({ type: 'RBRACKET', value: char });
            i++;
        } else if (char === ':') {
            tokens.push({ type: 'COLON', value: char });
            i++;
        } else if (char === ',') {
            tokens.push({ type: 'COMMA', value: char });
            i++;
        } else if (char === '"') {
            let str = '';
            i++;
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\' && i + 1 < input.length) {
                    if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(input[i + 1])) {
                        str += input[i] + input[i + 1];
                        i += 2;
                    } else {
                        tokens.push({ type: 'INVALID', value: '\\' + input[i + 1] });
                        break;
                    }
                } else if (input[i] === '\t' || input[i] === '\n' || input[i] === '\r') {
                    tokens.push({ type: 'INVALID', value: '\\' + input[i] });
                    break;
                } else {
                    str += input[i];
                    i++;
                }
            }
            if (i < input.length && input[i] === '"') {
                tokens.push({ type: 'STRING', value: str });
                i++;
            } else {
                tokens.push({ type: 'INVALID', value: str });
                break;
            }
        } else if (/\d/.test(char) || char === '-') {
            let num = '';
            let hasLeadingZero = false;
            if (char === '0' && i + 1 < input.length && /\d/.test(input[i + 1])) {
                hasLeadingZero = true;
            }
            while (i < input.length && (/\d/.test(input[i]) || input[i] === '.' || input[i] === '-' || input[i] === 'e' || input[i] === 'E' || input[i] === '+' || input[i] === '-')) {
                if ((input[i] === 'e' || input[i] === 'E') && (input[i + 1] === '+' || input[i + 1] === '-')) {
                    num += input[i];
                    num += input[i + 1];
                    i += 2;
                } else {
                    num += input[i];
                    i++;
                }
            }
            if (hasLeadingZero && num.length > 1 && num[1] !== '.') {
                tokens.push({ type: 'INVALID', value: num });
            } else if (/e[+-]?$/.test(num) || /e[+-]\d*[^\d]/.test(num)) {
                tokens.push({ type: 'INVALID', value: num });
            } else {
                tokens.push({ type: 'NUMBER', value: num });
            }
        } else if (input.substring(i, i + 4) === 'true') {
            tokens.push({ type: 'BOOLEAN', value: 'true' });
            i += 4;
        } else if (input.substring(i, i + 5) === 'false') {
            tokens.push({ type: 'BOOLEAN', value: 'false' });
            i += 5;
        } else if (input.substring(i, i + 4) === 'null') {
            tokens.push({ type: 'NULL', value: 'null' });
            i += 4;
        } else if (/\s/.test(char)) {
            i++; // Ignore whitespace
        } else {
            tokens.push({ type: 'INVALID', value: char });
            i++;
        }
    }
    return tokens;
}

function parseValue(tokens, index, depth) {
    if (depth > MAX_DEPTH) {
        return [false, index];
    }
    const token = tokens[index];
    if (['STRING', 'NUMBER', 'BOOLEAN', 'NULL'].includes(token.type)) {
        return [true, index + 1];
    } else if (token.type === 'LBRACE') {
        return parseObject(tokens, index, depth + 1);
    } else if (token.type === 'LBRACKET') {
        return parseArray(tokens, index, depth + 1);
    } else {
        return [false, index];
    }
}

function parseObject(tokens, startIndex, depth) {
    if (depth > MAX_DEPTH) {
        return [false, startIndex];
    }

    if (tokens[startIndex].type !== 'LBRACE') {
        return [false, startIndex];
    }

    let index = startIndex + 1;
    let expectingKey = true;
    let expectingColon = false;
    let expectingValue = false;
    let lastWasComma = false;

    while (index < tokens.length) {
        const token = tokens[index];
        if (expectingKey) {
            if (token.type === 'RBRACE') {
                return [!lastWasComma, index + 1];
            } else if (token.type === 'STRING') {
                expectingKey = false;
                expectingColon = true;
                lastWasComma = false;
            } else {
                return [false, index];
            }
        } else if (expectingColon) {
            if (token.type === 'COLON') {
                expectingColon = false;
                expectingValue = true;
            } else {
                return [false, index];
            }
        } else if (expectingValue) {
            const [valid, nextIndex] = parseValue(tokens, index, depth + 1); // increment depth
            if (!valid) {
                return [false, index];
            }
            index = nextIndex - 1;
            expectingValue = false;
            if (index + 1 < tokens.length && tokens[index + 1].type === 'COMMA') {
                index++;
                expectingKey = true;
                lastWasComma = true;
            } else if (index + 1 < tokens.length && tokens[index + 1].type === 'RBRACE') {
                return [true, index + 2];
            } else {
                lastWasComma = false;
            }
        } else {
            if (token.type === 'COMMA') {
                if (lastWasComma) {
                    return [false, index];
                }
                expectingKey = true;
                lastWasComma = true;
            } else if (token.type === 'RBRACE') {
                return [!lastWasComma, index + 1];
            } else {
                return [false, index];
            }
        }
        index++;
    }
    return [false, index];
}

function parseArray(tokens, startIndex, depth) {
    if (depth > MAX_DEPTH) {
        return [false, startIndex];
    }

    if (tokens[startIndex].type !== 'LBRACKET') {
        return [false, startIndex];
    }

    let index = startIndex + 1;
    let expectingValue = true;
    let lastWasComma = false;

    while (index < tokens.length) {
        const token = tokens[index];
        if (expectingValue) {
            if (token.type === 'RBRACKET') {
                return [!lastWasComma, index + 1];
            } else {
                const [valid, nextIndex] = parseValue(tokens, index, depth + 1); // increment depth
                if (!valid) {
                    return [false, index];
                }
                index = nextIndex - 1;
                expectingValue = false;
                if (index + 1 < tokens.length && tokens[index + 1].type === 'COMMA') {
                    index++;
                    expectingValue = true;
                    lastWasComma = true;
                } else {
                    lastWasComma = false;
                }
            }
        } else {
            if (token.type === 'COMMA') {
                expectingValue = true;
                lastWasComma = true;
            } else if (token.type === 'RBRACKET') {
                return [!lastWasComma, index + 1];
            } else {
                return [false, index];
            }
        }
        index++;
    }
    return [false, index];
}

function parser(tokens) {
    if (tokens.length === 0) {
        return false;
    }
    const firstToken = tokens[0];
    if (firstToken.type !== 'LBRACE' && firstToken.type !== 'LBRACKET') {
        return false;
    }
    const [valid, index] = parseValue(tokens, 0, 0);
    return valid && index === tokens.length;
}

function main() {
    if (process.argv.length < 3) {
        console.error('Usage: jsonparser <directory>');
        process.exit(1);
    }

    const directory = process.argv[2];

    fs.readdir(directory, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${err.message}`);
            process.exit(1);
        }

        files.filter(file => path.extname(file) === '.json').forEach(file => {
            const filePath = path.join(directory, file);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(`Error reading file ${file}: ${err.message}`);
                } else {
                    const tokens = lexer(data);
                    const isValid = parser(tokens);
                    if (isValid) {
                        console.log(`${file}: Valid JSON`);
                    } else {
                        console.log(`${file}: Invalid JSON`);
                    }
                }
            });
        });
    });
}

main();