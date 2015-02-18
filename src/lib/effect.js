'use strict';

var Analyser = require('./effect/analyser.js'),
    Distortion = require('./effect/distortion.js'),
    Echo = require('./effect/echo.js'),
    FakeContext = require('./effect/fake-context.js'),
    Filter = require('./effect/filter.js'),
    Flanger = require('./effect/flanger.js'),
    Panner = require('./effect/panner.js'),
    Phaser = require('./effect/phaser.js'),
    Recorder = require('./effect/recorder.js'),
    Reverb = require('./effect/reverb.js');

function Effect(context) {
    context = context || new FakeContext();

    var api,
        destination,
        nodeList = [],
        panning = new Panner(context),
        sourceNode;

    var add = function(node) {
        if(!node) { return; }
        nodeList.push(node);
        updateConnections();
        return node;
    };

    var remove = function(node) {
        var l = nodeList.length;
        for (var i = 0; i < l; i++) {
            if(node === nodeList[i]) {
                nodeList.splice(i, 1);
                break;
            }
        }
        var output = node._output || node;
        output.disconnect();
        updateConnections();
        return node;
    };

    var removeAll = function() {
        while(nodeList.length) {
            nodeList.pop().disconnect();
        }
        updateConnections();
        return api;
    };

    var destroy = function() {
        removeAll();
        context = null;
        destination = null;
        nodeList = [];
        if(sourceNode) {
            sourceNode.disconnect();
        }
        sourceNode = null;
    };

    var connect = function(a, b) {
        //console.log('> connect', (a.name || a.constructor.name), 'to', (b.name || b.constructor.name));

        var output = a._output || a;
        //console.log('> disconnect output: ', (a.name || a.constructor.name));
        output.disconnect();
        //console.log('> connect output: ', (a.name || a.constructor.name), 'to input:', (b.name || b.constructor.name));
        output.connect(b);
    };

    var connectToDestination = function(node) {
        var l = nodeList.length,
            lastNode = l ? nodeList[l - 1] : sourceNode;

        if(lastNode) {
            connect(lastNode, node);
        }

        destination = node;
    };

    var updateConnections = function() {
        if(!sourceNode) { return; }

        //console.log('updateConnections:', nodeList.length);

        var node,
            prev;

        for (var i = 0; i < nodeList.length; i++) {
            node = nodeList[i];
            //console.log(i, node);
            prev = i === 0 ? sourceNode : nodeList[i - 1];
            connect(prev, node);
        }

        if(destination) {
            connectToDestination(destination);
        }
    };

    /*
     * Effects
     */

    var analyser = function(fftSize, smoothing, minDecibels, maxDecibels) {
        var node = new Analyser(context, fftSize, smoothing, minDecibels, maxDecibels);
        return add(node);
    };

    // lowers the volume of the loudest parts of the signal and raises the volume of the softest parts
    var compressor = function(config) {
        config = config || {};

        var node = context.createDynamicsCompressor();

        node.update = function(config) {
            // min decibels to start compressing at from -100 to 0
            node.threshold.value = config.threshold !== undefined ? config.threshold : -24;
            // decibel value to start curve to compressed value from 0 to 40
            node.knee.value = config.knee !== undefined ? config.knee : 30;
            // amount of change per decibel from 1 to 20
            node.ratio.value = config.ratio !== undefined ? config.ratio : 12;
            // gain reduction currently applied by compressor from -20 to 0
            node.reduction.value = config.reduction !== undefined ? config.reduction : -10;
            // seconds to reduce gain by 10db from 0 to 1 - how quickly signal adapted when volume increased
            node.attack.value = config.attack !== undefined ? config.attack : 0.0003;
            // seconds to increase gain by 10db from 0 to 1 - how quickly signal adapted when volume redcuced
            node.release.value = config.release !== undefined ? config.release : 0.25;
        };

        node.update(config);

        return add(node);
    };

    var convolver = function(impulseResponse) {
        // impulseResponse is an audio file buffer
        var node = context.createConvolver();
        node.buffer = impulseResponse;
        return add(node);
    };

    var delay = function(time) {
        var node = context.createDelay();
        if(time !== undefined) { node.delayTime.value = time; }
        return add(node);
    };

    var echo = function(time, gain) {
        var node = new Echo(context, time, gain);
        return add(node);
    };

    var distortion = function(amount) {
        var node = new Distortion(context, amount);
        // Float32Array defining curve (values are interpolated)
        //node.curve
        // up-sample before applying curve for better resolution result 'none', '2x' or '4x'
        //node.oversample = '2x';
        return add(node);
    };

    var filter = function(type, frequency, quality, gain) {
        var filter = new Filter(context, type, frequency, quality, gain);
        return add(filter);
    };

    var lowpass = function(frequency, quality, gain) {
        return filter('lowpass', frequency, quality, gain);
    };

    var highpass = function(frequency, quality, gain) {
        return filter('highpass', frequency, quality, gain);
    };

    var bandpass = function(frequency, quality, gain) {
        return filter('bandpass', frequency, quality, gain);
    };

    var lowshelf = function(frequency, quality, gain) {
        return filter('lowshelf', frequency, quality, gain);
    };

    var highshelf = function(frequency, quality, gain) {
        return filter('highshelf', frequency, quality, gain);
    };

    var peaking = function(frequency, quality, gain) {
        return filter('peaking', frequency, quality, gain);
    };

    var notch = function(frequency, quality, gain) {
        return filter('notch', frequency, quality, gain);
    };

    var allpass = function(frequency, quality, gain) {
        return filter('allpass', frequency, quality, gain);
    };

    var flanger = function(config) {
        var node = new Flanger(context, config);
        return add(node);
    };

    var gain = function(value) {
        var node = context.createGain();
        if(value !== undefined) {
            node.gain.value = value;
        }
        return node;
    };

    var panner = function() {
        var node = new Panner(context);
        return add(node);
    };

    var phaser = function(config) {
        var node = new Phaser(context, config);
        return add(node);
    };

    var recorder = function(passThrough) {
        var node = new Recorder(context, passThrough);
        return add(node);
    };

    var reverb = function(seconds, decay, reverse) {
        var node = new Reverb(context, seconds, decay, reverse);
        return add(node);
    };

    var script = function(config) {
        config = config || {};
        // bufferSize 256 - 16384 (pow 2)
        var bufferSize = config.bufferSize || 1024;
        var inputChannels = config.inputChannels === undefined ? 0 : inputChannels;
        var outputChannels = config.outputChannels === undefined ? 1 : outputChannels;

        var node = context.createScriptProcessor(bufferSize, inputChannels, outputChannels);

        var thisArg = config.thisArg || config.context || node;
        var callback = config.callback || function() {};

        // available props:
        /*
        event.inputBuffer
        event.outputBuffer
        event.playbackTime
        */
        // Example: generate noise
        /*
        var output = event.outputBuffer.getChannelData(0);
        var l = output.length;
        for (var i = 0; i < l; i++) {
            output[i] = Math.random();
        }
        */
        node.onaudioprocess = callback.bind(thisArg);

        return add(node);
    };

    var setSource = function(node) {
        sourceNode = node;
        updateConnections();
        return node;
    };

    var setDestination = function(node) {
        connectToDestination(node);
        return node;
    };

    //

    api = {
        context: context,
        nodeList: nodeList,
        panning: panning,

        add: add,
        remove: remove,
        removeAll: removeAll,
        destroy: destroy,
        setSource: setSource,
        setDestination: setDestination,

        analyser: analyser,
        compressor: compressor,
        convolver: convolver,
        delay: delay,
        echo: echo,
        distortion: distortion,
        filter: filter,
        lowpass: lowpass,
        highpass: highpass,
        bandpass: bandpass,
        lowshelf: lowshelf,
        highshelf: highshelf,
        peaking: peaking,
        notch: notch,
        allpass: allpass,
        flanger: flanger,
        gain: gain,
        panner: panner,
        phaser: phaser,
        recorder: recorder,
        reverb: reverb,
        script: script
    };

    return Object.freeze(api);
}

module.exports = Effect;
