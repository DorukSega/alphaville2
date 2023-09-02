const N_ROWS = 160;
const N_COLS = 160;
const mid = (row, col, factor = N_ROWS) => (row * factor + col); // index of multi. dim. array
const dim = (ix, factor = N_ROWS) => ({ row: Math.floor(ix / factor), col: ix % factor });

/** @type {CanvasRenderingContext2D} */
let ctx;
let canvas_width;
let canvas_height;


/** @type {string[]} */
const memory = Array(N_ROWS * N_COLS).fill("#000000");
const old_memory = Array(N_ROWS * N_COLS).fill("#000000");

/** @type {Promise<{mem: string[][], t_scale: number}>} */
let tileset01 = [];
/** @type {Promise<{mem: string[][], t_scale: number}>} */
let playerset01 = [];
/** @type {Promise<{tmap: string[], x: number, y:number} >} */
let tilemap01 = {};
/** @type {string[]} */
let map_memory = [];

// Variables to store camera position
let cameraX, cameraY;
const moveSpeed = 2;
let player_dir = 0;

// Flags to track which arrow keys are pressed
let isLeftArrowPressed = false;
let isRightArrowPressed = false;
let isUpArrowPressed = false;
let isDownArrowPressed = false;

// Event listeners to detect arrow key presses
document.addEventListener('keydown', (event) => {
    switch (event.key) {
        case 'ArrowLeft':
            player_dir = 1;
            isLeftArrowPressed = true;
            break;
        case 'ArrowRight':
            player_dir = 5;
            isRightArrowPressed = true;
            break;
        case 'ArrowUp':
            player_dir = 2;
            isUpArrowPressed = true;
            break;
        case 'ArrowDown':
            player_dir = 9;
            isDownArrowPressed = true;
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.key) {
        case 'ArrowLeft':
            player_dir = 8;
            isLeftArrowPressed = false;
            break;
        case 'ArrowRight':
            player_dir = 12;
            isRightArrowPressed = false;
            break;
        case 'ArrowUp':
            player_dir = 4;
            isUpArrowPressed = false;
            break;
        case 'ArrowDown':
            player_dir = 0;
            isDownArrowPressed = false;
            break;
    }
});

window.onload = () => {
    /** @type {HTMLCanvasElement} */
    const canvas = document.getElementById("game");

    ctx = canvas.getContext("2d");
    canvas_width = canvas.width;
    canvas_height = canvas.height;

    // for (let i = 0; i < memory.length; i++) {
    //     memory[i] = generateRandomHexColor();
    // }

    // Load the tileset.png with 16 width cell size
    tileset01 = load_tileset("./tileset.png", 16);
    playerset01 = load_tileset("./player_tileset.png", 16);
    tilemap01 = load_tilemap("./tilemap.bin");
    //load_map(tileset01, tilemap01);

    // Start the animation loop
    requestAnimationFrame(animate);
}



/** @param {CanvasRenderingContext2D} ctx */
async function draw_memory(ctx, pixel_ratio) {
    memory.forEach(async (pixel, ix) => {
        if (old_memory[ix] !== pixel) {
            ctx.fillStyle = pixel;
            const { row, col } = dim(ix);
            ctx.fillRect(row * pixel_ratio, col * pixel_ratio, pixel_ratio, pixel_ratio);
            old_memory[ix] = pixel;
        }
    })
}


/** @param {number} r 
 *  @param {number} g 
 *  @param {number} b 
 */
function rgbToHex(r, g, b) {
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

function pixel_ratio(canvas_width, _canvas_height) {
    return Math.ceil(canvas_width / N_ROWS)
}


function generateRandomHexColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

async function load_tileset(img_path, t_scale) {
    let img_width, img_height;

    const image = new Image();
    const offscreen = new OffscreenCanvas(t_scale, t_scale);
    const ol = offscreen.getContext("2d");

    const t_set = [];

    await new Promise((resolve) => {
        image.onload = () => {
            img_width = image.width;
            img_height = image.height;

            const bitmaps = [];
            for (let x = 0; x < img_width / t_scale; x++) {
                for (let y = 0; y < img_height / t_scale; y++) {
                    bitmaps.push(
                        createImageBitmap(image, x * t_scale, y * t_scale, t_scale, t_scale)
                    );
                }
            }

            Promise.all(bitmaps).then(async (sprites) => {
                for (const spr of sprites) {
                    ol.drawImage(spr, 0, 0);
                    const arr = new Array(t_scale * t_scale).fill("#000000");
                    for (let ix = 0; ix < arr.length; ix++) {
                        const { row, col } = dim(ix, t_scale);
                        const arr4 = ol.getImageData(row, col, 1, 1).data;
                        if (arr4[3] == 0)
                            arr[ix] = undefined; // transparent
                        else
                            arr[ix] = rgbToHex(arr4[0], arr4[1], arr4[2]);

                    }
                    t_set.push(arr);
                }
                resolve(); // Resolve the outer promise when the tile_set is populated
            });
        };
        // Load the tile_set from an image file
        image.src = img_path;
    });

    return { mem: t_set, t_scale };
}

async function load_tilemap(tmap_path) {
    /** @type {number[]} */
    let tmap = [];
    let x = 0, y = 0;

    await new Promise((resolve) => {
        fetch(tmap_path, { responseType: 'arraybuffer' })
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => {
                const dataView = new DataView(arrayBuffer);
                x = dataView.getUint8(0);
                y = dataView.getUint8(1);
                tmap = Array.from(
                    { length: dataView.byteLength - 2 }, (_, i) => dataView.getUint8(i + 2)
                );
                resolve();
            })
            .catch(error => {
                console.error('Error fetching the binary file:', error);
            })

    });
    return { tmap, x, y };
}

/** @param {Promise<{mem: string[][], t_scale:number}>}tileset
 * @param  {Promise<{tmap: string[], x: number, y:number} >}tilemap
 */
function load_map(tileset, tilemap) {
    Promise.all([tileset, tilemap]).then(([tset, tmap]) => {
        if (!map_memory.length)
            map_memory = Array(tmap.x * tset.t_scale * tmap.y * tset.t_scale);
        for (let ix = 0; ix < map_memory.length; ix++) {
            try {
                const { row, col } = dim(ix, tmap.x * tset.t_scale);
                const map_row = Math.floor(row / tset.t_scale), map_col = Math.floor(col / tset.t_scale);
                const tileset_index = tmap.tmap[mid(map_col, map_row, tmap.x - 1)]
                const tileset_indv = mid(row, col, tset.t_scale) % (tset.t_scale * tset.t_scale);

                const tset_pixel = tset.mem[tileset_index][tileset_indv];
                map_memory[ix] = tset_pixel;

            } catch (error) {
                console.log(tmap.tmap, mid(map_col, map_row, tmap.x), tileset_index)
            }
        }
    })
}
const diagonalSpeed = moveSpeed / 1.41;

function updateCameraPosition() {
    // Check for diagonal movement
    if (isLeftArrowPressed && isUpArrowPressed) {
        cameraX -= diagonalSpeed;
        cameraY -= diagonalSpeed;
    }
    else if (isRightArrowPressed && isUpArrowPressed) {
        cameraX += diagonalSpeed;
        cameraY -= diagonalSpeed;
    }
    else if (isLeftArrowPressed && isDownArrowPressed) {
        cameraX -= diagonalSpeed;
        cameraY += diagonalSpeed;
    }
    else if (isRightArrowPressed && isDownArrowPressed) {
        cameraX += diagonalSpeed;
        cameraY += diagonalSpeed;
    }
    else if (isLeftArrowPressed) {
        cameraX -= moveSpeed;
    }
    else if (isRightArrowPressed) {
        cameraX += moveSpeed;
    }
    else if (isUpArrowPressed) {
        cameraY -= moveSpeed;
    }
    else if (isDownArrowPressed) {
        cameraY += moveSpeed;
    }
}

/** @param {Promise<{mem: string[][], t_scale:number}>}tileset
 * @param  {Promise<{tmap: string[], x: number, y:number} >}tilemap
 */
async function draw_map(tilemap, tileset) {
    await Promise.all([tileset, tilemap]).then(([tset, tmap]) => {
        const lenght = tmap.x * tset.t_scale;
        if (cameraX === undefined && cameraY === undefined) {
            cameraX = Math.floor(lenght / 2) - N_ROWS / 2;
            cameraY = Math.floor(lenght / 2) - N_COLS / 2;
        }

        //if (map_memory.length) {
        const tilebytile = (tset.t_scale * tset.t_scale);

        for (let ix = 0; ix < memory.length; ix++) {
            let { row, col } = dim(ix)
            row += Math.floor(cameraX);
            col += Math.floor(cameraY);
            const map_row = Math.floor(row / tset.t_scale), map_col = Math.floor(col / tset.t_scale);
            const tileset_index = tmap.tmap[mid(map_col, map_row, tmap.x - 1)]
            const tileset_indv = mid(row, col, tset.t_scale) % tilebytile
            if (row < 0 || row > lenght - 1 || col < 0 || col > lenght - 1)
                memory[ix] = "#000000";
            else {
                memory[ix] = tset.mem[tileset_index][tileset_indv];
            }
        }
    })
}


async function animate() {
    updateCameraPosition();

    await draw_map(tilemap01, tileset01);

    await playerset01.then(async pset => {
        const pwidth = pset.t_scale;
        for (let ix = 0; ix < pwidth * pwidth; ix++) {
            const { row, col } = dim(ix, pwidth)
            const memdex = mid(row + N_ROWS / 2 - pwidth, col + N_COLS / 2 - pwidth);
            if (pset.mem[player_dir][ix] !== undefined)
                memory[memdex] = pset.mem[player_dir][ix];
        }
    })

    draw_memory(ctx, pixel_ratio(canvas_width, canvas_height));

    calculateFPS();
    requestAnimationFrame(animate);
}

let fps = 0;
let lastFrameTime = performance.now();

const fpsBuffer = [];
const fpsBufferSize = 100;

function calculateFPS() {
    const currentTime = performance.now();
    const deltaTime = currentTime - lastFrameTime;

    fps = Math.round(1000 / deltaTime);

    fpsBuffer.push(fps);


    if (fpsBuffer.length > fpsBufferSize) {
        fpsBuffer.shift();
    }

    const averageFPS = Math.round(fpsBuffer.reduce((a, b) => a + b) / fpsBuffer.length);

    document.getElementById('fps').textContent = averageFPS + " FPS";
    lastFrameTime = currentTime;
}