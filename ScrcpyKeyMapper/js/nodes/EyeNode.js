import { BaseNode } from './BaseNode.js';
import { MAPPING_TYPES } from '../utils/constants.js';
import { KeyDisplayManager } from '../managers/KeyDisplayManager.js';

export class EyeNode extends BaseNode {
    constructor(stage, mappingData) {
        super(stage, MAPPING_TYPES.EYE, mappingData);

        this.mappingData = {
            ...mappingData,
            type: MAPPING_TYPES.EYE,
            key: mappingData.key || '',
            pos: mappingData.pos || { x: 0.5, y: 0.5 },
            maxOffsetX: mappingData.maxOffsetX || 0,
            maxOffsetY: mappingData.maxOffsetY || 0
        };

        this.shape = this.createShape();
        this.setupEvents();
        setTimeout(() => this.updateBoundaryRect(), 0);
        this.updateMappingData();
    }

    get supportsKey() {
        return true;
    }

    createShape() {
        const pos = window.scaleManager.denormalizePosition(this.mappingData.pos);

        const group = new Konva.Group({
            x: pos.x,
            y: pos.y,
            draggable: false,
            name: 'mainShape'
        });

        // Draggable inner group
        const eyeShape = new Konva.Group({
            x: 0,
            y: 0,
            draggable: true,
            name: 'eyeShape'
        });

        // Boundary rectangle (behind everything)
        this.boundaryRect = new Konva.Rect({
            x: 0, y: 0, width: 0, height: 0,
            stroke: 'rgba(255, 165, 0, 0.6)',
            strokeWidth: 2,
            dash: [6, 4],
            fill: 'rgba(255, 165, 0, 0.05)',
            listening: false,
            visible: false
        });
        group.add(this.boundaryRect);
        this.boundaryRect.moveToBottom();

        // Resize handles
        const handleColor = 'rgba(255, 165, 0, 0.8)';
        this.handles = this._createResizeHandles(handleColor);
        this.handles.forEach(h => group.add(h));

        // Eye circle
        const circle = new Konva.Circle({
            radius: 18,
            fill: 'transparent',
            stroke: '#ff8c00',
            strokeWidth: 2,
            opacity: 0.8
        });

        // Eye SVG path icon
        const eyeIcon = new Konva.Path({
            data: 'M10 0C5.5 0 1.7 3.1 0 7.5 1.7 11.9 5.5 15 10 15s8.3-3.1 10-7.5C18.3 3.1 14.5 0 10 0zM10 12.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8C8.3 4.5 7 5.8 7 7.5s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z',
            fill: '#ff8c00',
            scale: { x: 1.1, y: 1.1 },
            offset: { x: 10, y: 7.5 }
        });

        // Key display
        const keyDisplay = KeyDisplayManager.createKeyShape(
            this.mappingData.key,
            '#ff8c00',
            'transparent',
            2,
            (newKey) => this.setKey(newKey),
            '#fff',
            'transparent',
            1,
            0.8,
            true
        );
        keyDisplay.group.y(28);
        keyDisplay.group.x(-2);

        eyeShape.add(circle);
        eyeShape.add(eyeIcon);
        eyeShape.add(keyDisplay.group);
        group.add(eyeShape);

        return group;
    }

    _createResizeHandles(color) {
        const handleSize = 8;
        const makeHandle = (name) => {
            return new Konva.Rect({
                width: handleSize,
                height: handleSize,
                offsetX: handleSize / 2,
                offsetY: handleSize / 2,
                fill: 'white',
                stroke: color,
                strokeWidth: 1.5,
                draggable: true,
                visible: false,
                name: name
            });
        };

        const handleRight = makeHandle('handleRight');
        const handleLeft = makeHandle('handleLeft');
        const handleTop = makeHandle('handleTop');
        const handleBottom = makeHandle('handleBottom');

        // Constrain horizontal handles to x-axis only
        handleRight.dragBoundFunc(function(pos) {
            return { x: pos.x, y: this.absolutePosition().y };
        });
        handleLeft.dragBoundFunc(function(pos) {
            return { x: pos.x, y: this.absolutePosition().y };
        });
        handleTop.dragBoundFunc(function(pos) {
            return { x: this.absolutePosition().x, y: pos.y };
        });
        handleBottom.dragBoundFunc(function(pos) {
            return { x: this.absolutePosition().x, y: pos.y };
        });

        // Drag handlers
        const onHorizontalDrag = (handle) => {
            handle.on('dragmove', () => {
                const eyeShape = this.shape.findOne('.eyeShape');
                const cx = eyeShape ? eyeShape.x() : 0;
                const dist = Math.abs(handle.x() - cx);
                const background = this.shape.getStage()?.findOne('.background');
                const bgWidth = background ? background.width() : this.shape.getStage()?.width() || 100;
                const newOffset = Math.max(0.01, dist / bgWidth);
                this.mappingData.maxOffsetX = parseFloat(newOffset.toFixed(3));
                this.updateBoundaryRect();
                this._updatePropertyInput('#prop-eye-maxOffsetX', this.mappingData.maxOffsetX);
            });
        };

        const onVerticalDrag = (handle) => {
            handle.on('dragmove', () => {
                const eyeShape = this.shape.findOne('.eyeShape');
                const cy = eyeShape ? eyeShape.y() : 0;
                const dist = Math.abs(handle.y() - cy);
                const background = this.shape.getStage()?.findOne('.background');
                const bgHeight = background ? background.height() : this.shape.getStage()?.height() || 100;
                const newOffset = Math.max(0.01, dist / bgHeight);
                this.mappingData.maxOffsetY = parseFloat(newOffset.toFixed(3));
                this.updateBoundaryRect();
                this._updatePropertyInput('#prop-eye-maxOffsetY', this.mappingData.maxOffsetY);
            });
        };

        onHorizontalDrag(handleRight);
        onHorizontalDrag(handleLeft);
        onVerticalDrag(handleTop);
        onVerticalDrag(handleBottom);

        return [handleRight, handleLeft, handleTop, handleBottom];
    }

    _updatePropertyInput(selector, value) {
        const input = document.querySelector(selector);
        if (input) input.value = value;
    }

    setupEvents() {
        this.shape.on('select', () => this.updateSelection(true));
        this.shape.on('deselect', () => this.updateSelection(false));

        const eyeShape = this.shape.findOne('.eyeShape');

        // Right-click to toggle boundary rectangle
        eyeShape.on('contextmenu', (e) => {
            e.evt.preventDefault();
            if ((this.mappingData.maxOffsetX || 0) <= 0 && (this.mappingData.maxOffsetY || 0) <= 0) {
                this.mappingData.maxOffsetX = 0.1;
                this.mappingData.maxOffsetY = 0.1;
            } else {
                this.mappingData.maxOffsetX = 0;
                this.mappingData.maxOffsetY = 0;
            }
            this.updateBoundaryRect();
            if (window.nodeManager && window.nodeManager.selectedNode === this) {
                window.nodeManager.updateMappingProperties();
            }
        });

        eyeShape.on('dragmove', () => {
            this.updateShapePosition(eyeShape);
            this.updateBoundaryRect();
            this.updateMappingData();
        });

        eyeShape.on('dragend', () => {
            this.updateMappingData();
        });
    }

    updateShapePosition(shape) {
        const pos = window.scaleManager.normalizePosition(
            shape.x() + this.shape.x(),
            shape.y() + this.shape.y()
        );
        const constrained = window.scaleManager.constrainPosition(pos.x, pos.y);
        const denormalized = window.scaleManager.denormalizePosition(constrained);

        shape.x(denormalized.x - this.shape.x());
        shape.y(denormalized.y - this.shape.y());
    }

    updateSelection(selected) {
        if (!this.shape) return;
        const circle = this.shape.findOne('.eyeShape')?.findOne('Circle');
        if (circle) {
            circle.strokeWidth(selected ? 3 : 2);
            circle.shadowEnabled(selected);
            circle.shadowColor('black');
            circle.shadowBlur(10);
            circle.shadowOpacity(0.5);
            circle.shadowOffset({ x: 2, y: 2 });
        }

        // Show/hide resize handles
        this.handles.forEach(h => h.visible(selected && this.boundaryRect.visible()));
        if (this.shape.getLayer()) this.shape.getLayer().batchDraw();
    }

    updateMappingData() {
        if (!this.shape) return;
        const eyeShape = this.shape.findOne('.eyeShape');
        const absolutePos = {
            x: eyeShape.x() + this.shape.x(),
            y: eyeShape.y() + this.shape.y()
        };
        const normalized = window.scaleManager.normalizePosition(absolutePos.x, absolutePos.y);
        this.mappingData.pos = {
            x: parseFloat(normalized.x.toFixed(3)),
            y: parseFloat(normalized.y.toFixed(3))
        };
    }

    updateBoundaryRect() {
        const maxX = this.mappingData.maxOffsetX || 0;
        const maxY = this.mappingData.maxOffsetY || 0;

        if (maxX <= 0 && maxY <= 0) {
            this.boundaryRect.visible(false);
            this.handles.forEach(h => h.visible(false));
            if (this.shape.getLayer()) this.shape.getLayer().batchDraw();
            return;
        }

        const background = this.shape.getStage()?.findOne('.background');
        const bgWidth = background ? background.width() : this.shape.getStage()?.width() || 100;
        const bgHeight = background ? background.height() : this.shape.getStage()?.height() || 100;

        const rectWidth = maxX > 0 ? maxX * 2 * bgWidth : bgWidth;
        const rectHeight = maxY > 0 ? maxY * 2 * bgHeight : bgHeight;

        // Offset relative to the inner eyeShape position
        const eyeShape = this.shape.findOne('.eyeShape');
        const cx = eyeShape ? eyeShape.x() : 0;
        const cy = eyeShape ? eyeShape.y() : 0;

        this.boundaryRect.setAttrs({
            x: cx - rectWidth / 2,
            y: cy - rectHeight / 2,
            width: rectWidth,
            height: rectHeight,
            visible: true
        });

        // Position resize handles at edge midpoints
        const [handleRight, handleLeft, handleTop, handleBottom] = this.handles;
        handleRight.position({ x: cx + rectWidth / 2, y: cy });
        handleLeft.position({ x: cx - rectWidth / 2, y: cy });
        handleTop.position({ x: cx, y: cy - rectHeight / 2 });
        handleBottom.position({ x: cx, y: cy + rectHeight / 2 });

        // Show handles only if node is selected
        const isSelected = this.shape.findOne('.eyeShape')?.findOne('Circle')?.strokeWidth() === 3;
        this.handles.forEach(h => h.visible(isSelected));

        if (this.shape.getLayer()) this.shape.getLayer().batchDraw();
    }

    setKey(key) {
        this.mappingData.key = key;
        KeyDisplayManager.updateKeyShape(this.shape.findOne('.eyeShape'), key, true);
        this.updateMappingData();

        const keyInput = document.getElementById('mappingKeyProperties');
        if (keyInput) {
            keyInput.value = key;
        }
    }
}
