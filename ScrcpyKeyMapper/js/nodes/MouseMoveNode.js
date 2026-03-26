import { BaseNode } from './BaseNode.js';
import { MAPPING_TYPES } from '../utils/constants.js';

export class MouseMoveNode extends BaseNode {
    constructor(stage, mappingData) {
        super(stage, mappingData.type, mappingData);
        
        this.mappingData = {
            ...mappingData,
            startPos: mappingData.startPos || { x: 0.5, y: 0.5 },
            speedRatioX: parseFloat(mappingData.speedRatioX?.toFixed(5)) || 1,
            speedRatioY: parseFloat(mappingData.speedRatioY?.toFixed(5)) || 1,
            maxOffsetX: mappingData.maxOffsetX || 0,
            maxOffsetY: mappingData.maxOffsetY || 0,
            recenterDelayMs: mappingData.recenterDelayMs || 0,
            dualTouchMode: mappingData.dualTouchMode || 'none'
        };
        
        this.shape = this.createShape();
        this.setupEvents();
        setTimeout(() => this.updateBoundaryRect(), 0);
        this.updateMappingData();
    }

    createShape() {
        const group = new Konva.Group({
            x: window.scaleManager.denormalizePosition(this.mappingData.startPos).x,
            y: window.scaleManager.denormalizePosition(this.mappingData.startPos).y,
            draggable: false,
            name: 'mainShape'
        });

        // Create draggable container for the main circle and cursor
        const mouseShape = new Konva.Group({
            x: 0,
            y: 0,
            draggable: true,
            name: 'mouseShape'
        });

        // Outer circle container
        const circle = new Konva.Circle({
            radius: 20,
            fill: 'transparent',
            stroke: '#adb5bd',
            strokeWidth: 2,
            opacity: 0.8
        });

        // Mouse icon (simplified design)
        const mouseIcon = new Konva.Path({
            data: 'M7.5.026C4.958.286 3 2.515 3 5.188V5.5h4.5zm1 0V5.5H13v-.312C13 2.515 11.042.286 8.5.026M13 6.5H3v4.313C3 13.658 5.22 16 8 16s5-2.342 5-5.188z',
            fill: '#adb5bd',
            scale: { x: 1.3, y: 1.3 },
            offset: { x: 8, y: 8.5 }
        });

        // Boundary rectangle for maxOffset visualization
        this.boundaryRect = new Konva.Rect({
            x: 0, y: 0, width: 0, height: 0,
            stroke: 'rgba(0, 120, 255, 0.5)',
            strokeWidth: 2,
            dash: [8, 4],
            fill: 'rgba(0, 120, 255, 0.05)',
            listening: false,
            visible: false
        });
        group.add(this.boundaryRect);
        this.boundaryRect.moveToBottom();

        // Resize handles (hidden by default)
        const handleColor = 'rgba(0, 120, 255, 0.8)';
        this.handles = this._createResizeHandles(handleColor);
        this.handles.forEach(h => group.add(h));

        mouseShape.add(circle);
        mouseShape.add(mouseIcon);
        group.add(mouseShape);

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
        const self = this;
        handleRight.dragBoundFunc(function(pos) {
            return { x: pos.x, y: this.absolutePosition().y };
        });
        handleLeft.dragBoundFunc(function(pos) {
            return { x: pos.x, y: this.absolutePosition().y };
        });
        // Constrain vertical handles to y-axis only
        handleTop.dragBoundFunc(function(pos) {
            return { x: this.absolutePosition().x, y: pos.y };
        });
        handleBottom.dragBoundFunc(function(pos) {
            return { x: this.absolutePosition().x, y: pos.y };
        });

        // Drag handlers
        const onHorizontalDrag = (handle, side) => {
            handle.on('dragmove', () => {
                const mouseShape = this.shape.findOne('.mouseShape');
                const centerX = mouseShape.x();
                const dist = Math.abs(handle.x() - centerX);
                const background = this.shape.getStage()?.findOne('.background');
                const bgWidth = background ? background.width() : this.shape.getStage()?.width() || 100;
                const newOffset = Math.max(0.01, dist / bgWidth);
                this.mappingData.maxOffsetX = parseFloat(newOffset.toFixed(3));
                this.updateBoundaryRect();
                this._updatePropertyInput('#prop-maxOffsetX', this.mappingData.maxOffsetX);
            });
        };

        const onVerticalDrag = (handle, side) => {
            handle.on('dragmove', () => {
                const mouseShape = this.shape.findOne('.mouseShape');
                const centerY = mouseShape.y();
                const dist = Math.abs(handle.y() - centerY);
                const background = this.shape.getStage()?.findOne('.background');
                const bgHeight = background ? background.height() : this.shape.getStage()?.height() || 100;
                const newOffset = Math.max(0.01, dist / bgHeight);
                this.mappingData.maxOffsetY = parseFloat(newOffset.toFixed(3));
                this.updateBoundaryRect();
                this._updatePropertyInput('#prop-maxOffsetY', this.mappingData.maxOffsetY);
            });
        };

        onHorizontalDrag(handleRight, 'right');
        onHorizontalDrag(handleLeft, 'left');
        onVerticalDrag(handleTop, 'top');
        onVerticalDrag(handleBottom, 'bottom');

        return [handleRight, handleLeft, handleTop, handleBottom];
    }

    _updatePropertyInput(selector, value) {
        const input = document.querySelector(selector);
        if (input) input.value = value;
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

    setupEvents() {
        this.shape.on('select', () => this.updateSelection(true));
        this.shape.on('deselect', () => this.updateSelection(false));

        const mouseShape = this.shape.findOne('.mouseShape');

        // Right-click to toggle boundary rectangle
        mouseShape.on('contextmenu', (e) => {
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

        mouseShape.on('dragmove', () => {
            this.updateShapePosition(mouseShape);
            this.updateBoundaryRect();
            this.updateMappingData();
        });

        mouseShape.on('dragend', () => {
            this.updateMappingData();
        });
    }

    updateSelection(selected) {
        if (!this.shape) return;

        const circle = this.shape.findOne('.mouseShape').findOne('Circle');
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

        const mouseShape = this.shape.findOne('.mouseShape');
        const absolutePos = {
            x: mouseShape.x() + this.shape.x(),
            y: mouseShape.y() + this.shape.y()
        };
        
        const normalizedStartPos = window.scaleManager.normalizePosition(absolutePos.x, absolutePos.y);
        this.mappingData.startPos = {
            x: parseFloat(normalizedStartPos.x.toFixed(3)),
            y: parseFloat(normalizedStartPos.y.toFixed(3))
        };
    }

    setSpeedRatios(speedRatioX, speedRatioY) {
        this.mappingData.speedRatioX = Math.max(speedRatioX, 0.001);
        this.mappingData.speedRatioY = Math.max(speedRatioY, 0.001);
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

        // Offset relative to the inner mouseShape position
        const mouseShape = this.shape.findOne('.mouseShape');
        const cx = mouseShape ? mouseShape.x() : 0;
        const cy = mouseShape ? mouseShape.y() : 0;

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
        const isSelected = this.shape.findOne('.mouseShape')?.findOne('Circle')?.strokeWidth() === 3;
        this.handles.forEach(h => h.visible(isSelected));

        if (this.shape.getLayer()) this.shape.getLayer().batchDraw();
    }
}
