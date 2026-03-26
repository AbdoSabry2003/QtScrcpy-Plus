import { DEFAULT_CONFIG, MAPPING_TYPES } from '../utils/constants.js';
import { KeyDisplayManager } from './KeyDisplayManager.js';

export class ConfigManager {
    constructor(nodeManager) {
        this.nodeManager = nodeManager;
        this._switchKey = DEFAULT_CONFIG.SWITCH_KEY;
        this.setupConfigButtons();
    }

    get switchKey() {
        return this._switchKey;
    }

    set switchKey(value) {
        this._switchKey = value;
        // Update input value
        const switchKeyInput = document.getElementById('switchKeyGlobal');
        if (switchKeyInput) {
            switchKeyInput.value = KeyDisplayManager.formatKeyText(value);
        }
    }

    setupConfigButtons() {
        const saveButton = document.getElementById('saveConfig');
        const loadButton = document.getElementById('loadConfig');

        if (saveButton) {
            saveButton.addEventListener('click', () => {
                this.saveToJson();
            });
        }

        if (loadButton) {
            loadButton.addEventListener('change', (event) => {
                if (event.target.files.length > 0) {
                    this.loadFromJson(event.target.files[0]);
                    // Reset the file input value so the same file can be selected again
                    event.target.value = '';
                }
            });
        }
    }

    saveToJson() {
        try {
            const allMappings = this.nodeManager.getMappingsData();
            const mouseMove = allMappings.find(m => m.type === MAPPING_TYPES.MOUSE_MOVE);
            const eyeNodes = allMappings.filter(m => m.type === MAPPING_TYPES.EYE);
            const otherMappings = allMappings.filter(m => m.type !== MAPPING_TYPES.MOUSE_MOVE && m.type !== MAPPING_TYPES.EYE);

            // Remove old smallEyes if present
            if (mouseMove) {
                delete mouseMove.smallEyes;
            }

            // Add extraEyes to mouseMoveMap
            if (mouseMove && eyeNodes.length > 0) {
                mouseMove.extraEyes = eyeNodes.map(e => {
                    const data = { key: e.key, pos: e.pos };
                    if (e.maxOffsetX > 0) data.maxOffsetX = e.maxOffsetX;
                    if (e.maxOffsetY > 0) data.maxOffsetY = e.maxOffsetY;
                    return data;
                });
            }

            const background = this.nodeManager.stage.findOne('.background');
            const config = {
                switchKey: this.switchKey,
                mouseMoveMap: mouseMove,
                keyMapNodes: otherMappings,
                width: background?.getAttr('originalWidth') || this.nodeManager.stage.width(),
                height: background?.getAttr('originalHeight') || this.nodeManager.stage.height()
            };

            // Create a Blob containing the JSON data
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link element to trigger the download
            const link = document.createElement('a');
            link.href = url;
            link.download = 'key-mapping-config.json';
            document.body.appendChild(link);
            link.click();

            // Clean up
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error saving configuration:', error);
        }
    }

    loadFromJson(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                
                // Clear existing mappings
                this.nodeManager.clearAllNodes();

                // Set switch key
                if (config.switchKey) {
                    this.switchKey = config.switchKey;
                }

                // Load mouseMoveMap if present
                if (config.mouseMoveMap) {
                    // Extract extraEyes before creating the mouse move node
                    let extraEyes = config.mouseMoveMap.extraEyes || null;

                    // Backward compatibility: convert old smallEyes into extraEyes
                    if (!extraEyes && config.mouseMoveMap.smallEyes) {
                        const se = config.mouseMoveMap.smallEyes;
                        extraEyes = [{
                            key: se.key || 'Key_Alt',
                            pos: se.pos || { x: 0.7, y: 0.7 }
                        }];
                    }

                    const source = {
                        type: MAPPING_TYPES.MOUSE_MOVE,
                        ...config.mouseMoveMap
                    };
                    // Remove extraEyes and smallEyes from mouseMoveMap source
                    delete source.extraEyes;
                    delete source.smallEyes;
                    this.nodeManager.createNode(source);

                    // Create EyeNodes from extraEyes
                    if (extraEyes && Array.isArray(extraEyes)) {
                        extraEyes.forEach(eye => {
                            this.nodeManager.createNode({
                                type: MAPPING_TYPES.EYE,
                                key: eye.key,
                                pos: eye.pos,
                                maxOffsetX: eye.maxOffsetX || 0,
                                maxOffsetY: eye.maxOffsetY || 0
                            });
                        });
                    }
                }

                // Load keyMapNodes
                if (config.keyMapNodes) {
                    config.keyMapNodes.forEach(source => {
                        this.nodeManager.createNode(source);
                    });
                }

                // Apply current scale to all nodes
                const currentScale = parseFloat(document.getElementById('nodeScale').value) || 1.0;
                this.nodeManager.nodes.forEach(node => {
                    node.setScale(currentScale);
                });

                // Redraw the layer
                this.nodeManager.layer.batchDraw();
            } catch (error) {
                console.error('Error loading configuration:', error);
            }
        };
        reader.readAsText(file);
    }
}
