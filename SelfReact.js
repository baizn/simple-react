
function ReactDOMTextComponent(text) {
	//存当前字符串
	this._currentElement = '' + text;
	//用来标示当前的component
	this._rootNodeID = null;
}

//渲染生成dom结构
ReactDOMTextComponent.prototype.mountComponent = function(rootID) {
	this._rootNodeID = rootID;
	return '<span data-reactid="' + rootID + '">' + this._currentElement + '</span>';
}

ReactDOMTextComponent.prototype.receiveComponent = function(nextText) {
	var nextStringText = '' + nextText;

	if(nextStringText !== this._currentElement) {
		this._currentElement = nextStringText;

		$('[data-reactid="' + this._rootNodeID + '"]').html(this._currentElement);
	}
}
//component工厂，生成component实例
function instantiateReactComponent(node) {
	if(typeof node === 'string' || typeof node === 'number') {
		return new ReactDOMTextComponent(node);
	}

	if(typeof node === 'object' && typeof node.type === 'string') {
		return new ReactDOMComponent(node);
	}

	if(typeof node === 'object' && typeof node.type === 'function') {
		return new ReactCompositeComponent(node);
	}
}

function ReactElement(type, key, props) {
	this.type = type;
	this.key = key;
	this.props = props;
}

function ReactDOMComponent(element) {
	this._currentElement = element;
	this._rootNodeID = null;
}

ReactDOMComponent.prototype.mountComponent = function(rootID) {
	this._rootNodeID = rootID;
	var props = this._currentElement.props;
	var tagOpen = '<' + this._currentElement.type;
	var tagClose = '</' + this._currentElement.type + '>';

	tagOpen += ' data-reactid=' + this._rootNodeID;

	for(var propKey in props) {
		if(/^on[A-Za-z]/.test(propKey)) {
			var eventType = propKey.replace('on', '');
			$(document).delegate('[data-reactid="' + this._rootNodeID + '"]',
				eventType + '.' + this._rootNodeID, props[propKey]);

		}

		if(props[propKey] && props[propKey] !== 'children' && !/^on[A-Za-z]/.test(propKey)) {
			tagOpen += ' ' + propKey + '=' + props[propKey];
		}
	}

	//获取子节点渲染的内容
	var content = '';
	var children = props.children || [];

	var childrenInstances = [];
	var that = this;

	$.each(children, function(key, child) {
		//实例化子节点component
		var childComponentInstance = instantiateReactComponent(child);
		childComponentInstance._mountIndex = key;

		childrenInstances.push(childComponentInstance);

		//子节点的rootId= parent-rootId + '.' + key
		var curRootId = that._rootNodeID + '.' + key;
		//得到子节点的渲染内容
		var childMarkup = childComponentInstance.mountComponent(curRootId);

		content += ' ' + childMarkup;
	})

	this._renderedChildren = childrenInstances;

	return tagOpen + '>' + content + tagClose;

}

//全局的更新深度
var updateDepth = 0;
//全局的更新队列，所有的差异都存这里
var diffQueue = [];

ReactDOMComponent.prototype._updateDOMChildren = function(nextChildElements) {
	updateDepth++;
	//_diff用来递归找出差别，组装差异对象，添加到更新队列的diffQueue
	this._diff(diffQueue, nextChildElements);
	updateDepth--;
	if(updateDepth === 0) {
		//在合适的时机调用patch，把差异更新到dom上
		this._patch(diffQueue);
		diffQueue = [];
	}
}

ReactDOMComponent.prototype._updateDOMProperties = function(lastProps, nextProps) {

	//遍历lastProps，当老的属性不在新属性集合时，则删除
	for(var propKey in lastProps) {
		//propkey在新属性集合或在原型上面存在
		if(nextProps.hasOwnProperty(propKey) || !lastProps.hasOwnProperty(propKey)) {
			continue;
		}

		if(/^on[A-Za-z]/.test(propKey)) {
			var eventType = propKey.replace('on', '');

			//针对当前的节点取消事件代理

			$(document).undelegate('[data-reactid="' + this._rootNodeID + '"]',
				eventType, lastProps[propKey]);

			continue;
		}

		//从DOM中删除不需要的属性
		$('[data-reactid="' + this._rootNodeID + '"]').removeAttr(propKey);
	}

	//new attributes need add to dom
	for(propKey in nextProps) {
		if(/^on[A-Za-z]/.test(propKey)) {
			var eventType = propKey.replace('on', '');
			lastProps[propKey] && $(document).undelegate('[data-reactid="' + this._rootNodeID + '"]', eventType, lastProps[propKey]);

			$(document).delegate('[data-reactid="' + this._rootNodeID + '"]',
				eventType, nextProps[propKey]);
			continue;
		}

		if(propKey === 'children') {
			continue;
		}

		$('[data-reactid="' + this._rootNodeID + '"]').prop(propKey, nextProps[propKey]);
	}
}

ReactDOMComponent.prototype.receiveComponent = function(nextElement) {
	var lastProps = this._currentElement.props;
	var nextProps = nextElement.props;

	this._currentElement = nextElement;

	//单独更新属性
	this._updateDOMProperties(lastProps, nextProps);

	//更新子节点
	this._updateDOMChildren(nextElement.props.children);
}

//差异更新的几种类型
var UPDATE_TYPES = {
	MOVE_EXISTING: 1,
	REMOVE_NODE: 2,
	INSERT_MARKUP: 3
};

/**
	将子组件转换成一个map
*/
function flattenChildren(componentChildren) {
	var child;
	var name;
	var childrenMap = {};
	for(var i = 0, len = componentChildren.length; i < len; i++) {
		child = componentChildren[i];
		name = child && child._currentElement && child._currentElement.key ?
			child._currentElement.key : i.toString(36);
		childrenMap[name] = child;
	}
	return childrenMap;
}

/**
	生成子节点elements的component
*/
function generateComponentChildren(prevChildren, nextChildrenElements) {
	var nextChildren = {};
	nextChildrenElements = nextChildrenElements || [];
	$.each(nextChildrenElements, function(index, element) {
		var name = element.key ? element.key : index;
		var prevChild = prevChildren && prevChildren[name];
		var prevElement = prevChildren && prevChildren._currentElement;
		var nextElement = element;

		if(_shouldUpdateReactComponent(prevElement, nextElement)) {
			//需要更新，递归调用子节点的receiveComponent
			prevChild.receiveComponent(nextElement);

			//使用旧的component
			nextChildren[name] = prevChild;
		} else {
			//没有旧的，重新生成一个component
			var nextChildInstance = instantiateReactComponent(nextElement, null);

			//使用新的component
			nextChildren[name] = nextChildInstance;
		}
	})
	return nextChildren;
}

ReactDOMComponent.prototype._diff = function(diffQueue, nextChildrenElements) {
	var self = this;

	//将_renderedChildren转为map
	var prevChildren = flattenChildren(self._renderedChildren);

	//生成新的子节点的component对象集合
	var nextChildren = generateComponentChildren(prevChildren, nextChildrenElements);

	self._renderedChildren = [];
	$.each(nextChildren, function(key, instance) {
		self._renderedChildren.push(instance);
	})

	var lastIndex = 0; //访问的最后一次的老的集合位置
	//到达新的节点的index
	var nextIndex = 0;
	for(var name in nextChildren) {
		if(!nextChildren.hasOwnProperty(name)) {
			continue;
		}
		var prevChild = prevChildren && prevChildren[name];
		var nextChild = nextChildren[name];

		if(prevChild === nextChild) {
			//同一个component，需要移动
			diffQueue.push({
				parentId: self._rootNodeID,
				parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
				type: UPDATE_TYPES.MOVE_EXISTING,
				fromIndex: prevChild._mountIndex,
				toIndex: nextIndex
			});

			prevChild._mountIndex < lastIndex && diffQueue.push({
				parentId: this._rootNodeID,
				parentNode: $('[data-reactid=' + this._rootNodeID + ']'),
				type: UPDATE_TYPES.REMOVE_NODE,
				fromIndex: prevChild._mountIndex,
				toIndex: null
			});
			lastIndex = Math.max(prevChild._mountIndex, lastIndex);
		} else {
			//新增节点
			if(prevChild) {
				//如果原来component还存在，则只是属性不一样
				diffQueue.push({
					parentId: self._rootNodeID,
					parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
					type: UPDATE_TYPES.REMOVE_NODE,
					fromIndex: prevChild._mountIndex,
					toIndex: null
				});

				lastIndex = Math.max(prevChild._mountIndex, lastIndex);

				//原来的component已经渲染，通过命名空间清空之前所有的事件监听
				if(prevChild._rootNodeID) {
					$(document).undelegate('.' + prevChild._rootNodeID);
				}
			}

			//新增节点，组装差异对象放到队列里
			diffQueue.push({
				parentId: self._rootNodeID,
				parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
				type: UPDATE_TYPES.INSERT_MARKUP,
				fromIndex: null,
				toIndex: nextIndex,
				markup: nextChild.mountComponent() //新增节点的DOM内容
			});
		}

		//update mount index
		nextChild._mountIndex = nextIndex;
		nextIndex++;
	}

	//老节点里面有，新节点里没有的全部删掉
	for(name in prevChildren) {
		if(prevChildren.hasOwnProperty(name) && !( nextChildren && nextChildren.hasOwnProperty(name)) ) {
			//添加差异对象，类型REMOVE_NODE
			diffQueue.push({
				parentId: self._rootNodeID,
				parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
				type: UPDATE_TYPES.REMOVE_NODE,
				fromIndex: prevChild._mountIndex,
				toIndex: null
			});

			if(prevChildren[name]._rootNodeID) {
				$(document).undelegate('.' + prevChildren[name]._rootNodeID);
			}
		}
	}
}

function insertChildAt(parentNode, childNode, index) {
	var beforeChild = parentNode.children().get(index);
	beforeChild ? childNode.insertBefore(beforeChild) : childNode.appendTo(parentNode);
}

ReactDOMComponent.prototype._patch = function(updates) {
	var update;
	var initialChildren = [];
	var deleteChildren = [];

	for(var i = 0, len = updates.length; i < len; i++) {
		update = updates[i];
		if(update.type === UPDATE_TYPES.MOVE_EXISTING || update.type === UPDATE_TYPES.REMOVE_NODE) {
			var updatedIndex = update.fromIndex;
			var updatedChild = $(update.parentNode.children().get(updatedIndex));
			var parentID = update.parentID;

			//所有更新的节点都保存
			initialChildren[parentID] = initialChildren[parentID] || [];
			initialChildren[parentID][updatedIndex] = updatedChild;

			deleteChildren.push(updatedChild);
		}
	}

	//删除所有已更新的节点
	$.each(deleteChildren, function(index, child) {
		$(child).remove();
	});

	for(var i = 0, len = updates.length; i < len; i++) {
		update = updates[i];
		switch(update.type) {
			case UPDATE_TYPES.INSERT_MARKUP:
				insertChildAt(update.parentNode, $(update.markup), update.toIndex);
				break;
			case UPDATE_TYPES.MOVE_EXISTING:
				insertChildAt(update.parentNode, initialChildren[update.parentID][update.fromIndex]);
				break;
			case UPDATE_TYPES.REMOVE_NODE:
				break;
		}
	}
}

//定义ReactClass类，所有自定义的超级父类
var ReactClass = function() {

}

//留给子类去继承覆盖
ReactClass.prototype.render = function() {}

ReactClass.prototype.setState = function(newState) {
	this._reactInternalInstance.receiveComponent(null, newState);
}

React = {
	nextReactRootIndex: 0,
	createClass: function(spec) {
		//child class
		var Constructor = function(props) {
			this.props = props;
			this.state = this.getInitialState ? this.getInitialState() : null;
		}

		//原型继承
		Constructor.prototype = new ReactClass();
		Constructor.prototype.constructor = Constructor;

		$.extend(Constructor.prototype, spec);
		return Constructor;
	},
	createElement: function(type, config, children) {
		var props = {}, propName;
		config = config || {};
		var key = config.key || null;
		for(propName in config) {
			if(config.hasOwnProperty(propName) && 'key' !== propName) {
				props[propName] = config[propName];
			}
		}

		//处理children，全部加载到props的children属性上
		var childrenLength = arguments.length - 2;
		if(childrenLength === 1) {
			props.children = $.isArray(children) ? children : [children];
		} else if( childrenLength > 1 ) {
			var childArray = Array(childrenLength);
			for(var i = 0; i < childrenLength; i++) {
				childArray[i] = arguments[i + 2];
			}
			props.children = childArray;
		}

		return new ReactElement(type, key, props);
	},
	render: function(element, container) {
		var componentInstance = instantiateReactComponent(element);
		var markup = componentInstance.mountComponent(React.nextReactRootIndex++);
		$(container).html(markup);

		//触发mount事件
		$(document).trigger('mountReady');
	}
}

function ReactCompositeComponent(element) {
	this._currentElement = element;
	this._rootNodeID = null;
	//存放对应ReactClass的实例
	this._instance = null;
}

ReactCompositeComponent.prototype.mountComponent = function(rootID) {
	this._rootNodeID = rootID;
	var publicProps = this._currentElement.props;
	var ReactClass = this._currentElement.type;
	var inst = new ReactClass(publicProps);
	this._instance = inst;

	inst._reactInternalInstance = this;

	if(inst.componentWillMount) {
		inst.componentWillMount();
	}

	//调用ReactClass的render方法，返回一个element或文本节点
	var renderedElement = this._instance.render();

	//得到renderedElement对应的component实例
	var renderedComponentInstance = instantiateReactComponent(renderedElement);
	this._renderedComponent = renderedComponentInstance;

	var renderedMarkup = renderedComponentInstance.mountComponent(this._rootNodeID);

	$(document).on('mountReady', function() {
		// 调用inst.componentDidMount
		inst.componentDidMount && inst.componentDidMount();
	});

	return renderedMarkup;
}

ReactCompositeComponent.prototype.receiveComponent = function(nextElement, newState) {
	//如果使用了新的，就使用新的element
	this._currentElement = nextElement || this._currentElement;

	var inst = this._instance;

	//合并state
	var nextState = $.extend(inst.state, newState);
	var nextProps = this._currentElement.props;

	inst.state = nextState;

	if(inst.shouldComponentUpdate && !inst.shouldComponentUpdate(nextProps, nextState)) {
		return;
	}

	var preveComponentInstance = this._renderedComponent;
	var prevRenderedElement = preveComponentInstance._currentElement;

	//reRender - new element
	var nextRenderedElement = this._instance.render();

	if(_shouldUpdateReactComponent(prevRenderedElement, nextRenderedElement)) {
		//需要重新更新，就继续调用子节点的receiveComponent方法，传入新的element更新子节点
		preveComponentInstance.receiveComponent(nextRenderedElement);

		//调用componentDidUpdate表示更新完成
		inst.componentDidUpdate && inst.componentDidUpdate();
	} else {
		//如果是完全不同的两种element，则重新渲染
		var thisID = this._rootNodeID;

		//重新new一个对应的component
		this._renderedComponent = this._instantiateReactComponent(nextRenderedElement);

		//重新生成对应的元素内容
		var nextMarkup = _renderedComponent.mountComponent(thisID);

		//直接替换整个节点
		$('[data-reactid="' + this._rootNodeID + '"]').repalceWith(nextMarkup);
	}
}

/**
	用来判定两个element需不需要更新
*/
var _shouldUpdateReactComponent = function(prevElement, nextElement) {
	if(prevElement && nextElement) {
		var prevType = typeof prevElement;
		var nextType = typeof nextElement;
		if(prevType === 'string' || prevType === 'number') {
			return nextType === 'string' || nextType === 'number';
		} else {
			return nextType === 'object' && prevElement.type === nextElement.type
				&& prevElement.key === nextElement.key;
		}
	}
	return false;
}


/**DEMO*/
var TodoList = React.createClass({
	getInitialState: function() {
		return {
			items: []
		}
	},

	add: function() {
		var nextItems = this.state.items.concat([this.state.text]);
		this.setState({
			items: nextItems,
			text: ''
		})
	},

	onChange: function(e) {
		this.setState({
			text: e.target.value
		});
	},

	render: function() {
		var createItem = function(itemText) {
			return React.createElement('div', null, itemText);
		}

		var lists = this.state.items.map(createItem);
		var input = React.createElement('input', {
			onchange: this.onChange.bind(this),
			value: this.state.text
		});
		var button = React.createElement('button', {
			onclick: this.add.bind(this)
		}, 'Add#' + (this.state.items + 1));
		var children = lists.concat([input, button]);

		return React.createElement('div', null, children);
	}
});

React.render(React.createElement(TodoList), document.querySelector('#container'));
