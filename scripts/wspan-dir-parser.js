/***
 * DIR parser for JavaScript
 *
 * Copyright (c) 2014 Todd Hambley (MIT License).
 *
 */
/*jshint
  laxcomma:true
  laxbreak:true
  eqnull:true
  loopfunc:true
  sub:true
*/
;(function(){
"use strict";

	function ribbon ( feed ) {
    var _slot = null;
    var org = feed + '';
    var pos = 0;

    return {
      save: function () {
        _slot = pos;
      }
    , load: function () {
        pos = _slot;
        feed = org.slice( pos );
      }
    , advance: function ( n ) {
        pos += ( typeof n === 'string' ) ? n.length : n;
				if (pos > 0) {
					return ( feed = org.slice( pos ) );
				} else {
					return feed = '';
				}
      }
		, read: function ( n ) {
				var info = feed.substring(0, n);
				this.advance(n);
				return info;
		}
    , lookbehind: function ( nchars ) {
        nchars = nchars == null ? 1 : nchars;
        return org.slice( pos - nchars, pos );
      }
    , startsWith: function ( s ) {
        return feed.substring(0, s.length) === s;
      }
    , valueOf: function(){
        return feed;
      }
    , toString: function(){
        return feed;
      }
    };
  }
	
	/********* tree ***************/
	//https://github.com/spikebrehm/arboreal
	
	function include (array, item) {
    return array.indexOf(item) > -1;
  }
	
	function _traverseDown (context, iterator) {
    var doContinue = true;

    (function walkDown (node) {
      var i, newContext;

      if (!doContinue) return;

      if (iterator(node) === false) {
        //break the traversal loop if the iterator returns a falsy value
        doContinue = false;
      }
      else {
        for (i = 0; i < node.children.length; i++) {
          newContext = node.children[i];
          walkDown(newContext);
        }
      }
    })(context);
  }


  function _traverseUp (context, iterator) {
    var i, node, doContinue;

    while (context) {
      if ( iterator(context) === false ) return;

      for (i = 0; i < context.children.length; i++) {
        node = context.children[i];
        if ( iterator(node) === false ) return;
      }
      context = context.parent;
    }
  }


  function _traverse (context, iterator, callback) {
    var visited = [],
        callIterator = function (node) {
          var id = node.id,
              returned;

          if (! include(visited, id)) {
            returned = iterator.call(node, node);
            visited.push(id);

            if (returned === false) {
              return returned;
            }
          }
        },
        i, node;

    callback(context, callIterator);
  }
	
	function _removeChild (node) {
    var parent = node.parent,
        child,
        i;

    for (i = 0; i < parent.children.length; i++) {
      child = parent.children[i];

      if (child === node) {
        return parent.children.splice(i, 1).shift();
      }
    }
  }
	
	function nodeId (parent, separator) {
    separator = separator || '/';
    if (parent) {
      return [parent.id, parent.children.length].join(separator);
    }
    else {
      return '0';
    }
  }
	
	function DIRTree (parent, data, id) {
    this.depth = parent ? parent.depth + 1 : 0;
    this.data = data || {};
    this.parent = parent || null;
    this.id = id || nodeId(parent);
    this.children = [];
  }
	
	DIRTree.prototype.appendChild = function (data, id) {
    var child = new DIRTree(this, data, id);
    this.children.push(child);
    return child;
  };

  DIRTree.prototype.removeChild = function (arg) {
    if (typeof arg === 'number' && this.children[arg]) {
      return this.children.splice(arg, 1).shift();
    }
    if (arg instanceof DIRTree) {
      return _removeChild(arg);
    }
    throw new Error("Invalid argument "+ arg);
  };

  DIRTree.prototype.remove = function () {
    return _removeChild(this);
  };


  DIRTree.prototype.root = function () {
    var node = this;

    if (!node.parent) {
      return this;
    }

    while (node.parent) {
      node = node.parent;
    }
    return node;
  };

  DIRTree.prototype.isRoot = function () {
    return !this.parent;
  };
	
	DIRTree.prototype.toString = function () {
    var lines = [];

    this.traverseDown(function (node) {
      var separator = '|- ', indentation = '',  i;

      if (node.depth === 0) {
        lines.push(node.id);
        return;
      }
      for (i = 0; i < node.depth; i++) {
        indentation += '|';
      }
      lines.push( indentation + separator + node.data.path + ((node.data.value) ? ' = ' + node.data.value : ''));
    });
    return lines.join("\n");
  };
	
	DIRTree.prototype.toXML = function () {
    var lines = [];

    (function walkDownXML(node) {
			var indentation = ''
			var i;
			var nodeName = node.data.name.replace(/\//g, '');
			
			for (i = 0; i < node.depth; i++) {
				indentation += '  ';
			}

			if (node.children.length > 0) {
				lines.push(indentation + "<" + nodeName + ">");
				for (var c = 0; c < node.children.length; c++) {
					walkDownXML(node.children[c]);
				}
				lines.push(indentation + "</" + nodeName + ">");
			} else {
				lines.push(indentation + "<" + nodeName + ">" + node.data.value + "</" + nodeName + ">");
			}
			
    })(this);
    return lines.join("\n");
  };
	
	DIRTree.prototype.traverseDown = function (iterator) {
    _traverse(this, iterator, _traverseDown);
  };
	
	/********* tree ***************/
	
	function getVariableLengthString( dirResponse ) {
		var firstChar = dirResponse.read(1);
		var readLength = parseInt(firstChar);
		if (!isNaN(readLength)) {
			return dirResponse.read(readLength);
		} else {
			return firstChar;
		}
	}
	var getSectionTypeCode = getVariableLengthString;
	
	function getVariableLengthNumber ( dirResponse ) {
		return parseInt( getVariableLengthString( dirResponse ));
	}
	var getSectionLength = getVariableLengthNumber;
	var getElementCount = getVariableLengthNumber;
	
	function parseDIRSection( msgText, parent ) {
		if (msgText.startsWith('*') || msgText.startsWith('.')) {
			// multiple item section (or subsection)
			var arrayType = msgText.read(1);
			var elementCount = getElementCount( msgText );
			var sectionType = getSectionTypeCode( msgText );
			var sectionText = ribbon( msgText.read( getSectionLength(msgText)) );
			
			var node = parent.appendChild( { name: sectionType, path: parent.data.path + '.' + sectionType });
			
			for (var elementCounter = 0; elementCounter < elementCount; elementCounter++) {
				parseDIRSection( sectionText, node );
			}
			
		} else {
			var sectionType = msgText.read(1)
			if (sectionType != '>' && sectionType != '0') {
				var sectionStartNumber = parseInt(sectionType); // is the section start a number?  if it is - it isn't really the section type.  read the number of characters in the section number to get the section type
				if (!isNaN(sectionStartNumber)) {
					sectionType = msgText.read(sectionStartNumber);
				}
				var sectionText = ribbon( msgText.read (getSectionLength( msgText )) );
				parent.appendChild({ name: sectionType, value: sectionText, path: parent.data.path + '.' + sectionType});
			}
		}
	}

	function parseDIRMessage( dirText ) {
		dirText = (typeof dirText === 'string') ? ribbon( dirText ) : dirText;

		var msgTree;
		
		if (/(.*?\$\d+)(\d)[A-Z]+/.test(dirText.toString())) {
			//find the beginning of the DIR data.
			//it will look something like this:
			//$000000000002163PNR511175H239M23ADG
			dirText.advance(/(.*?\$\d+)(\d)[A-Z]+/.exec(dirText.toString())[1]);
			
			var typeLength = parseInt(dirText.read(1));
			var msgType = dirText.read(typeLength);
			
			//DIRTree (parent, data, id)
			msgTree = new DIRTree(null, {name : msgType, path : msgType }, msgType);
			
			var msgText = ribbon( dirText.read(getSectionLength(dirText)) );
			
			var startLength = msgText.toString().length;
			while (msgText.toString().length > 0 ) {
				parseDIRSection( msgText, msgTree );
			}
		}
		
		return msgTree;
	}
	
	var wspanDIR = {
		parseDIRMessage: parseDIRMessage
	};

  /* exposed */

  if ( typeof module !== 'undefined' && module.exports ) {
    module.exports = wspanDIR;
  }
  else {
    this.wspanDIR = wspanDIR;
  }

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());
